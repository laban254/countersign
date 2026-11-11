# Countersign Security & Trust Model

## 1. Trust Boundaries

- **The AI model is untrusted for execution.** The LLM only drafts proposals, explains stored
  decisions, and runs read-only simulations. It has no approval, execution, or policy-write path.
- **Dashboard actions require authentication.** When `ADMIN_TOKEN` is configured, every dashboard
  and seed endpoint requires a matching bearer token. In production `ADMIN_TOKEN` is mandatory and
  the server refuses to start without it.
- **Agents authenticate with their own bearer tokens.** The request body cannot select a different
  agent. An invalid or missing token fails with `401 UNAUTHORIZED`.
- **Fail-closed principle.** Policy validation rejects missing/invalid limits, approval revalidation
  denies when the agent, policy, recipient, or budget changed, and unverified PayPal webhooks are
  rejected in production.

## 2. Authentication & Credential Storage

### Agent API tokens

- Tokens are shaped `cs_<agentId>_<secret>`.
- Lookup uses the stored `tokenPrefix` (`cs_<agentId>`), so agent IDs containing underscores work.
- Only `HMAC-SHA256(secret, AGENT_TOKEN_PEPPER)` is persisted. The raw token is returned exactly
  once at registration/rotation and is never logged.
- Verification uses `crypto.timingSafeEqual` on equal-length buffers.
- `POST /api/v1/agent/payment-intents` ignores any `agent_id` field in the body and uses only the
  authenticated identity. There is no "first active agent" fallback.
- `AGENT_TOKEN_PEPPER` must be stable across restarts; changing it invalidates every issued token.

### Dashboard admin token

- `ADMIN_TOKEN` protects dashboard, policy, recipient, approval, ledger, AI, and seed endpoints.
- Comparison is constant-time. The token may be sent as `Authorization: Bearer <token>` or
  `x-admin-token`.
- The browser stores the token in `sessionStorage` and sends it as a bearer header. A rejected token
  clears the session and shows the login gate.
- Development may leave `ADMIN_TOKEN` unset to keep the local demo open. Production must set it.

### PayPal webhooks

- When `PAYPAL_WEBHOOK_ID` and API credentials are configured, the server calls PayPal's
  `/v1/notifications/verify-webhook-signature` endpoint before accepting an event.
- Events are deduplicated by PayPal event ID and reconciled against the stored payout batch/item.
- In development, unsigned webhooks are accepted with a warning so the demo can be exercised. In
  production they are rejected with `503 PAYMENT_EXECUTION_UNAVAILABLE` if verification is not
  configured, or `401` if the signature is invalid.

## 3. Policy Validation & Immutable Snapshots

- Every policy version is validated before persistence:
  - limits must be finite non-negative integers in minor units,
  - `maxTransaction <= daily <= monthly`,
  - `ABOVE_THRESHOLD` requires a finite threshold not greater than the per-transaction limit,
  - the approval mode and currency allowlist are from closed sets.
- This prevents the historical `NaN` threshold bug where `amountMinor > NaN` silently authorized
  every payment.
- When an intent is created its policy version is deep-cloned (`structuredClone`). Activating a new
  version archives the live row but cannot mutate historical intent snapshots.
- Approval revalidates against the current agent status, active policy version, current recipient
  status, and current settled/reserved spend (excluding the intent's own reservation). A mismatch
  fails with `POLICY_CHANGED_SINCE_APPROVAL`, `AGENT_INACTIVE`, `AGENT_REVOKED`, or the relevant
  limit reason code, and the reservation is released.

## 4. Budget Reservations

- `PENDING_APPROVAL` reserves budget for 24 hours.
- Directly authorized execution reserves for 15 minutes.
- A lazy sweeper releases expired reservations and marks the intent `EXPIRED`, unless a payout is
  already in flight (in which case the provider may still settle it).
- Reservations are released on denial, rejection, revalidation failure, expiry, and provider failure;
  they settle only on confirmed provider success (webhook or terminal success response).
- Settled spend is attributed to the period in which it settled, using UTC day/month boundaries.

## 5. Cryptographic Audit Ledger

- Append-only in-process event log.
- Hash calculation:
  `Hash_i = HMAC-SHA256(K, Hash_{i-1} || CanonicalJSON(Event_i))`, where `Event_i` includes the
  event ID, workspace, agent/intent references, event type, actor, payload, and timestamp.
- Including metadata means changing an event type, actor, reference, or timestamp breaks the chain.
- Event IDs must be strictly increasing; reordering is rejected.
- `LEDGER_HASH_SECRET` is required in production (minimum 16 characters). A development-only
  fallback is used locally with a warning.
- **Limitation:** truncating events from the tail of the chain leaves a valid prefix. Production
  deployments should anchor the head hash externally (for example, periodically persist it to an
  append-only store or a separate service).

## 6. Idempotency

- Client → Countersign: `Idempotency-Key` (or body `idempotency_key`), scoped to the authenticated
  agent.
- A replay with the same canonical request hash returns the original intent with
  `Idempotent-Replay: true` and HTTP 200.
- Reusing a key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`.
- Countersign → PayPal: `PayPal-Request-Id` is the intent ID.
- Batch identity: deterministic `sender_batch_id = cs-<intentId>`.

## 7. Persistence & Anchoring

- With `DATABASE_URL` set, the runtime persists a JSON snapshot and appends a ledger anchor
  (`head_hash`, `event_count`) in a single transaction. Startup verifies the full chain and rejects
  a snapshot whose event count or head hash does not match the latest anchor.
- Anchors are append-only; deleting a snapshot's tail without also rewriting the anchor is detected.
- Without `DATABASE_URL`, the runtime is in memory. Restarting loses data and the ledger; this is the
  default for tests and local development.
- The normalized Prisma entity tables remain the target model; the durable path currently uses a
  snapshot for restart safety rather than per-entity repositories.

## 8. Known Limitations

- A database administrator who can rewrite both the snapshot and every anchor is outside the threat
  model. For stronger guarantees, publish the anchor head hash to an external append-only system.
- The seeded `operations-agent` secret defaults to a public demo value and must be replaced with
  `DEMO_AGENT_SECRET` for any non-demo deployment. The simulator no longer bundles the token.
- The ledger's HMAC key protects against undetected edits but not against a party who holds both the
  key and the ability to rewrite the entire chain and its external anchor.
- This is a sandbox prototype. It is not production custody, a regulated financial service, or a
  substitute for a real payment operations control framework.
