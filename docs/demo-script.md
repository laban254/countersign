# Countersign — 3-Minute Golden Demo Walkthrough

## Setup
1. Launch Countersign at `http://localhost:3000`.
   - If `ADMIN_TOKEN` is set, sign in with that token at the login gate.
2. Notice the control plane console with real-time spending limits: $120.00 daily limit, $300.00 monthly limit.
3. Observe `operations-agent` registered under active Policy v3 ($100 max per transaction, $40 human countersign threshold).
4. The seeded demo token is `cs_agt_operations_001_<DEMO_AGENT_SECRET>`. The default secret is `live_demo_secret_key_8849`; set `DEMO_AGENT_SECRET` for any non-demo deployment. Paste the token into the Agent Simulator's bearer-token field (the UI no longer bundles it).

## Beat 1: The Compliant Payment Requiring Approval (0:00 – 1:10)
1. Click **"Run Golden Demo"** in the navigation bar, or run:
   ```bash
   AGENT_TOKEN=cs_agt_operations_001_live_demo_secret_key_8849 \
     npm run agent-sim -- --amount 49 --recipient vendor-sandbox@example.test
   ```
2. The agent submits a $49.00 USD invoice for "November software subscription".
3. The deterministic policy engine evaluates all rules:
   - Within $100.00 transaction limit: ✓
   - Recipient approved: ✓
   - Within daily/monthly caps: ✓
   - Exceeds $40.00 threshold: ● Triggers `PENDING_APPROVAL` with `HUMAN_APPROVAL_REQUIRED`.
4. Open the **Approvals Queue**:
   - Inspect the **DecisionCard** showing checkmarks and reason codes.
   - Click **"Approve & Dispatch PayPal Payout"**.
   - Confirmation dialog restates amount and recipient.
5. Payout executes via PayPal Sandbox:
   - The simulator settles immediately; a real Sandbox batch returns `PENDING` and settles within about a minute, via the verified webhook when `PAYPAL_WEBHOOK_ID` is configured, otherwise via the 15-second reconciliation poll (or the **Check PayPal status** button in the payment drawer).
   - On confirmed success the reservation settles (`SETTLED`) and the payout status becomes `SUCCEEDED` with PayPal batch/item/transaction references.
   - Ledger records `PAYOUT_SUCCEEDED` and `RESERVATION_SETTLED`.

## Beat 2: Hard Limit Denial (1:10 – 1:50)
1. In the Agent Simulator (or via the Golden Demo button), notice the $180.00 payment request.
2. The policy engine rejects it deterministically:
   - Reason code: `AMOUNT_EXCEEDS_TRANSACTION_LIMIT`.
   - Result: `DENIED`.
   - Money never moves and no payout call reaches PayPal.
3. Open the **AI Assistant** panel and ask:
   *"Why was the $180 payment denied?"*
   The assistant retrieves stored records and explains the exact policy constraint breached.

## Beat 3: Policy Simulation & Tamper-Evident Ledger (1:50 – 2:30)
1. Ask the assistant:
   *"What if this agent requested $80 right now?"*
   The assistant executes a dry-run simulation against current settled spend ($49 settled + $80 = $129 > $120 daily cap) and renders a simulated DecisionCard showing `DAILY_LIMIT_EXCEEDED`.
2. Navigate to the **Audit Ledger**:
   - Click **"Verify Cryptographic Chain"**.
   - Watch the HMAC-SHA256 validator verify every hash link back to the Genesis block.
   - Click **"Export CSV"** to demonstrate audit compliance.
