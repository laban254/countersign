# SDKs and an MCP server from the OpenAPI spec (APIMatic)

Countersign's agent-facing API is described in [`openapi.yaml`](../openapi.yaml) (OpenAPI 3.0.3, validated
with Redocly). It is also served by the app at
`/openapi.yaml` on your deployment.

[APIMatic](https://www.apimatic.io/) turns an OpenAPI definition into typed SDKs, documentation and
**MCP servers**. An MCP server generated from this spec lets any MCP-capable agent (Claude, for example)
request payments through Countersign as a tool, with every request still going through the policy engine,
human countersign and audit ledger.

## Generate

1. Sign in to APIMatic and choose **Import API**.
2. Import from the URL `https://<your-host>/openapi.yaml`
   (or upload `openapi.yaml`).
3. Generate a **TypeScript** (or Python) SDK, and an **MCP server** if available on your plan.
4. Configure the agent token as the bearer credential (`cs_<agentId>_<secret>`).

## Example: an agent asks to pay

```ts
// Using a generated SDK (names follow the operationIds in the spec).
const intent = await client.createPaymentIntent({
  idempotencyKey: crypto.randomUUID(),
  recipient: { name: 'Second Signature Cloud', email: 'vendor@example.com' },
  amount: { value: '49.00', currency: 'USD' },
  description: 'November software invoice',
  invoiceReference: 'INV-2026-1101',
});
// intent.decision is AUTHORIZED, PENDING_APPROVAL or DENIED. The agent cannot approve its own payment.
```

## Operations in the spec

| operationId | Method and path | Purpose |
|---|---|---|
| `createPaymentIntent` | `POST /agent/payment-intents` | Request a payment (`201` accepted, `422` denied, `200` replay) |
| `listPaymentIntents` | `GET /agent/payment-intents` | List this agent's intents |
| `getPaymentIntent` | `GET /agent/payment-intents/{id}` | Poll status until settled |
| `getCurrentAgent` | `GET /agent/me` | Identify the calling agent |
| `getHealth` | `GET /health` | Liveness and ledger-chain status |
