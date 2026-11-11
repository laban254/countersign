/**
 * End-to-end smoke test against a running Countersign instance.
 *
 * Usage:
 *   ADMIN_TOKEN=... AGENT_TOKEN=cs_agt_... npm run smoke
 *   BASE_URL=http://localhost:3000 ... npm run smoke
 *
 * Agent submission is skipped when AGENT_TOKEN is not provided.
 */
import '../src/server/env.ts';

const baseUrl = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const adminToken = process.env.ADMIN_TOKEN || '';
const agentToken = process.env.AGENT_TOKEN || '';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...extra,
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
  };
}

async function jsonRequest(
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function main() {
  console.log(`Countersign smoke test → ${baseUrl}\n`);

  const health = await jsonRequest('/api/v1/health');
  check('health endpoint responds', health.status === 200, `HTTP ${health.status}`);
  check('ledger chain is valid', health.body?.ledgerChainValid === true);

  const authStatus = await jsonRequest('/api/v1/auth/status');
  check('auth status responds', authStatus.status === 200, `HTTP ${authStatus.status}`);
  if (authStatus.body?.authRequired && !adminToken) {
    console.error('\nADMIN_TOKEN is required for this instance.');
    process.exit(1);
  }

  const agents = await jsonRequest('/api/v1/agents', { headers: adminHeaders() });
  check('dashboard is reachable', agents.status === 200, `HTTP ${agents.status}`);
  const agentList = Array.isArray(agents.body) ? agents.body : [];
  check(
    'agent token hashes are not exposed',
    agentList.every((agent: Record<string, unknown>) => !('tokenHash' in agent))
  );

  if (agentToken) {
    const idempotencyKey = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const submission = await jsonRequest('/api/v1/agent/payment-intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${agentToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        recipient: { email: process.env.DEMO_RECIPIENT_EMAIL || 'vendor-sandbox@example.test' },
        amount: { value: '49.00', currency: 'USD' },
        description: 'Smoke test payment',
        invoice_reference: 'INV-SMOKE-1',
      }),
    });

    check(
      'agent submission is accepted',
      submission.status === 201 || submission.status === 200,
      `HTTP ${submission.status}`
    );
    check(
      'submission has a deterministic decision',
      ['PENDING_APPROVAL', 'AUTHORIZED', 'DENIED'].includes(submission.body?.decision)
    );

    const intentId = submission.body?.id;
    if (intentId && submission.body?.status === 'PENDING_APPROVAL') {
      const approval = await jsonRequest(`/api/v1/payment-intents/${intentId}/approve`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ comment: 'smoke test' }),
      });
      check(
        'approval executes or submits the payout',
        approval.status === 200 &&
          ['SUCCEEDED', 'PENDING', 'PROCESSING', 'UNCLAIMED', 'HELD', 'FAILED'].includes(
            approval.body?.status
          ),
        `HTTP ${approval.status} status=${approval.body?.status}`
      );
    }
  } else {
    console.log('  SKIP  agent submission (AGENT_TOKEN not set)');
  }

  const verification = await jsonRequest('/api/v1/ledger/verify', {
    headers: adminHeaders(),
  });
  check('ledger verification endpoint responds', verification.status === 200);
  check('ledger remains valid', verification.body?.valid === true);
  check(
    'ledger head hash is present',
    typeof verification.body?.headHash === 'string' &&
      verification.body.headHash.length === 64
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
