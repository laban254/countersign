# Countersign API Reference (`/api/v1`)

## Authentication

| Caller | Credential | Required |
|---|---|---|
| Dashboard / operator | `Authorization: Bearer <ADMIN_TOKEN>` (or `x-admin-token`) | When `ADMIN_TOKEN` is set; mandatory in production |
| AI agent | `Authorization: Bearer cs_<agentId>_<secret>` | Always for `/agent/*` |
| PayPal | Webhook transmission signature | When `PAYPAL_WEBHOOK_ID` and credentials are configured |

Public endpoints: `GET /health`, `GET /auth/status`, `POST /auth/verify`, and `POST /webhooks/paypal`
(which verifies the PayPal signature rather than an admin token).

Unauthenticated or invalid credentials return:

```json
{ "error": "Invalid or missing agent bearer token", "code": "UNAUTHORIZED" }
```

---

## Auth Endpoints

### `GET /auth/status`
Returns `{ "authRequired": boolean, "demoMode": boolean }`.

### `GET /auth/demo`
Public. Returns `{ "enabled": false }`, or, when `DEMO_PUBLIC_TOKEN` is set, `{ "enabled": true, "token", "agentToken" }` so the landing page can open the console. The token resolves to the restricted `judge` role (`403 DEMO_RESTRICTED` on agent token rotation and agent status changes).

### `POST /auth/verify`
Body: `{ "token": "<ADMIN_TOKEN>" }`. Returns `{ "ok": true, "authRequired": true }` or `401`.

---

## Agent Endpoints

### `POST /agent/payment-intents`
- **Headers**: `Authorization: Bearer <agent_token>`, `Idempotency-Key: <unique_string>`,
  `Content-Type: application/json`.
- **Body**:
```json
{
  "recipient": {
    "name": "Second Signature Cloud",
    "email": "vendor-sandbox@example.test"
  },
  "amount": { "value": "49.00", "currency": "USD" },
  "description": "November software invoice",
  "invoice_reference": "INV-2026-1101",
  "metadata": { "source": "operations-agent" }
}
```
- The body `agent_id` field is ignored; the authenticated token determines the agent.
- **Responses**:
  - `201 Created`: new intent (`AUTHORIZED` or `PENDING_APPROVAL`).
  - `200 OK`: idempotent replay, with `Idempotent-Replay: true`.
  - `409 Conflict`: same idempotency key with a different payload (`IDEMPOTENCY_KEY_REUSED`).
  - `422 Unprocessable Entity`: `DENIED` with reason codes.
  - `401 Unauthorized`: missing or invalid agent token.

### `GET /agent/payment-intents`
Returns only the authenticated agent's intents. Optional `?status=` filter.

### `GET /agent/payment-intents/:id`
Returns the intent if it belongs to the authenticated agent, otherwise `404`.

### `GET /agent/me`
Returns the authenticated agent's public record (no token hash).

---

## Dashboard Endpoints

All dashboard endpoints require the admin bearer token when `ADMIN_TOKEN` is configured.

- `GET /overview`: aggregated statistics, spending gauges, pending approvals, agents, policies.
- `GET /payment-intents`: list intents; optional `?status=`.
- `GET /payment-intents/:id`: full intent detail.
- `POST /payment-intents/:id/approve`: revalidates and executes. Body `{ "comment": "..." }`.
  - `409` with `AGENT_REVOKED`, `AGENT_INACTIVE`, `POLICY_CHANGED_SINCE_APPROVAL`,
    `RESERVATION_EXPIRED`, or a limit reason code when revalidation fails.
- `POST /payment-intents/:id/reconcile`: polls PayPal for a `PENDING`/`HELD`/`UNCLAIMED` payout and settles or releases the budget. The server also does this every 15 seconds, so settlement does not depend on webhook delivery.
- `POST /payment-intents/:id/reject`: releases the reservation.
- `GET /agents`: list agents (no token hashes).
- `POST /agents`: register an agent. Body `{ "name", "description", "activePolicyVersionId?" }`.
  Returns `{ "agent", "rawTokenOnce" }`. When `activePolicyVersionId` is omitted the current active
  version is assigned.
- `PATCH /agents/:id/status`: `{ "status": "ACTIVE" | "PAUSED" | "REVOKED" }`. Revocation is terminal.
- `POST /agents/:id/rotate-token`: returns a new `rawTokenOnce`.
- `GET /policies`: policies with all versions.
- `POST /policies/:id/versions`: create a validated draft version.
- `POST /policies/:id/versions/:versionId/activate`: activate a version belonging to that policy.
- `GET /recipients`: list recipients.
- `POST /recipients`: `{ "displayName", "email", "status?" }`; emails are normalized and deduplicated.
- `PATCH /recipients/:id`: `{ "status": "APPROVED" | "BLOCKED" }`.
- `GET /ledger/events`: optional `?payment_intent_id=`.
- `GET /ledger/verify`: returns `{ valid, totalEvents, headHash, reason? }`.
- `GET /analytics/spending`: optional `?agent_id=`.
- `POST /ai/policy-draft`: `{ "prompt" }` → validated policy proposal.
- `POST /ai/assistant`: `{ "question" }` → read-only answer with record references.
- `POST /ai/simulate`: `{ "amountMinor", "recipientEmail", "currency"?, "agentId"? }` → dry-run
  evaluation. Simulations do not mutate state.
- `POST /seed/golden-demo`: creates a fresh $49 pending intent and $180 denial (unique keys each run).
- `POST /seed/reset`: resets the in-memory store and ledger. Destructive; admin-protected.

---

## Webhook Endpoint

### `POST /webhooks/paypal`
- Verifies `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-CERT-URL`,
  `PAYPAL-AUTH-ALGO`, and `PAYPAL-TRANSMISSION-SIG` via PayPal when configured.
- Deduplicates by provider event ID.
- Reconciles `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`, `FAILED`, `RETURNED`, `BLOCKED`, `UNCLAIMED`,
  `HELD`, `REFUNDED`, and `PAYMENT.PAYOUTSBATCH.DENIED`.
- Settles the reservation only on confirmed success and releases it on terminal failure.

---

## Error Contract

```json
{ "error": "Human-readable message", "code": "STABLE_MACHINE_CODE" }
```

Common codes: `UNAUTHORIZED`, `INVALID_REQUEST`, `INVALID_POLICY_VERSION`,
`IDEMPOTENCY_KEY_REUSED`, `AGENT_NOT_FOUND`, `AGENT_REVOKED`, `AGENT_INACTIVE`,
`POLICY_CHANGED_SINCE_APPROVAL`, `RESERVATION_EXPIRED`, `INVALID_STATE_TRANSITION`,
`NOT_FOUND`, `INTERNAL_ERROR`.

Unknown `/api/v1/*` routes return a JSON `404` with code `NOT_FOUND`, never the SPA HTML.
