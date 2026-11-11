/**
 * Countersign Agent Simulator CLI
 * Dispatches simulated payment intents to the running Countersign instance.
 *
 * Usage:
 *   npm run agent-sim
 *   AGENT_TOKEN=cs_agt_... npm run agent-sim -- --amount 49 --recipient vendor-sandbox@example.test
 *   npm run agent-sim -- --amount 180 --recipient vendor-sandbox@example.test
 */
import '../src/server/env.ts';

const args = process.argv.slice(2);

function getArg(key: string, defaultVal: string): string {
  const index = args.indexOf(`--${key}`);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return defaultVal;
}

const amount = getArg('amount', '49.00');
const recipient = getArg('recipient', process.env.DEMO_RECIPIENT_EMAIL || 'vendor-sandbox@example.test');
const desc = getArg('desc', 'Monthly software infrastructure license');
const invoice = getArg('invoice', `INV-${Date.now().toString().slice(-6)}`);
const host = getArg('host', 'http://localhost:3000');

async function main() {
  console.log('----------------------------------------------------');
  console.log(' COUNTERSIGN AGENT SIMULATOR CLI                    ');
  console.log('----------------------------------------------------');
  console.log(`Submitting Intent: $${amount} USD to ${recipient}`);
  console.log(`Invoice Ref: ${invoice}`);
  console.log(`Target Host: ${host}/api/v1/agent/payment-intents\n`);

  const token = getArg('token', process.env.AGENT_TOKEN || '');
  if (!token) {
    console.error(
      'A bearer token is required. Set AGENT_TOKEN or pass --token cs_agt_...'
    );
    process.exit(1);
  }
  const idempKey = `cli-${Date.now()}`;

  try {
    const res = await fetch(`${host}/api/v1/agent/payment-intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempKey,
      },
      body: JSON.stringify({
        recipient: {
          name: 'Second Signature Cloud',
          email: recipient,
        },
        amount: {
          value: amount,
          currency: 'USD',
        },
        description: desc,
        invoice_reference: invoice,
        metadata: {
          source: 'CLI Agent Simulator',
        },
      }),
    });

    const data = await res.json();
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    console.log(`Decision:   ${data.decision}`);
    console.log(`Status:     ${data.status}`);
    console.log(`Reason:     ${data.reasonCodes?.join(', ') || 'NONE'}`);
    console.log(`Explanation:\n${data.explanation}\n`);

    if (data.decision === 'PENDING_APPROVAL') {
      console.log('>>> Intent queued for human countersign in the dashboard.');
    } else if (data.decision === 'DENIED') {
      console.log('>>> Intent rejected by deterministic policy engine. Money did not move.');
    } else if (data.decision === 'AUTHORIZED') {
      console.log('>>> Authorized! PayPal Sandbox payout dispatched.');
    }
  } catch (err) {
    console.error('Failed to communicate with Countersign server:', err);
    process.exit(1);
  }
}

main();

export {};
