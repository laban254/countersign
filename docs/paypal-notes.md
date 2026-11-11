# PayPal Integration Notes (Payouts REST API)

## Rail Selection: Payouts vs Orders v2
- **Orders v2**: Designed for interactive buyer-facing checkouts. Requires buyer login redirection or buyer approval popups, plus seller onboarding for third-party payees.
- **Payouts API**: Designed specifically for server-to-server disbursements, vendor invoices, and automated disbursements to any email. No buyer interaction or JS SDK required. Perfect match for AI agent autonomous vendor payments.

## Idempotency Specifications
- **PayPal-Request-Id**: UUID/Intent ID passed in header to prevent duplicate network calls.
- **sender_batch_id**: Deterministically mapped to `cs-<payment_intent_id>`. PayPal guarantees that duplicate submissions within 30 days are rejected and return a reference to the existing batch.

## Webhooks
Subscribed events:
- `PAYMENT.PAYOUTSBATCH.SUCCESS`
- `PAYMENT.PAYOUTSBATCH.DENIED`
- `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`
- `PAYMENT.PAYOUTS-ITEM.FAILED`
- `PAYMENT.PAYOUTS-ITEM.REFUNDED`
- `PAYMENT.PAYOUTS-ITEM.UNCLAIMED`
- `PAYMENT.PAYOUTS-ITEM.RETURNED`

Settlement does not depend on webhooks: the server also polls PayPal for every open payout every
15 seconds (and on demand via `POST /payment-intents/:id/reconcile`). Webhooks make settlement
faster and add signature-verified provider events to the audit trail.

### Enabling signature-verified webhooks (deployed demo)
Webhooks need a public HTTPS URL, so this is configured after deploying (for example on Render).

1. Deploy and note the public URL, e.g. `https://countersign.onrender.com`.
2. PayPal Developer Dashboard → Apps & Credentials (Sandbox) → your app → **Webhooks → Add Webhook**.
3. Webhook URL: `https://<your-host>/api/v1/webhooks/paypal`.
4. Subscribe to the events listed above.
5. Copy the generated **Webhook ID** and set it as `PAYPAL_WEBHOOK_ID` in the Render environment
   (it is declared in `render.yaml` with `sync: false`, so it must be set by hand). Redeploy.
6. Test with a real payout (approve a payment) and watch the ledger for `WEBHOOK_RECEIVED`. Do not
   use the Webhook Simulator: its mock events do not carry a signature PayPal can verify, so they are
   correctly rejected with `401`.

Behavior: with `PAYPAL_WEBHOOK_ID` and credentials set, an event with an invalid signature is
rejected with `401`. In production without them, webhooks are rejected with `503` (polling still
settles payouts). In development, unsigned events are accepted with a warning.
