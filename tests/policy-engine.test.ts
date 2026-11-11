import { evaluatePolicy } from '../src/domain/policy/evaluate.ts';
import { Agent, PolicyVersion, Recipient } from '../src/domain/types.ts';

export function runPolicyEngineTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const mockAgent: Agent = {
    id: 'agt_test_001',
    workspaceId: 'ws_demo_001',
    name: 'test-agent',
    description: 'Unit testing agent',
    tokenPrefix: 'cs_agt_test_001',
    tokenHash: 'abc',
    status: 'ACTIVE',
    activePolicyVersionId: 'pol_ver_003',
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  const mockPolicy: PolicyVersion = {
    id: 'pol_ver_003',
    policyId: 'pol_001',
    version: 3,
    maxTransactionMinor: 10000, // $100.00
    dailyLimitMinor: 12000, // $120.00
    monthlyLimitMinor: 30000, // $300.00
    approvalMode: 'ABOVE_THRESHOLD',
    approvalThresholdMinor: 4000, // $40.00
    allowNewRecipients: false,
    currencyAllowlist: ['USD'],
    status: 'ACTIVE',
    createdBy: 'usr_001',
    createdAt: new Date().toISOString(),
  };

  const mockRecipient: Recipient = {
    id: 'rec_001',
    workspaceId: 'ws_demo_001',
    displayName: 'Test Vendor',
    email: 'vendor@example.test',
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    createdBy: 'usr_001',
  };

  function assert(name: string, condition: boolean, detail = '') {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`FAILED: ${name} ${detail}`);
    }
  }

  // Test 1: Active agent below threshold -> AUTHORIZED
  {
    const res = evaluatePolicy({
      agent: mockAgent,
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 2500, // $25.00
      currency: 'USD',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T1: Amount below threshold is AUTHORIZED', res.decision === 'AUTHORIZED');
  }

  // Test 2: Amount above $40 threshold -> PENDING_APPROVAL
  {
    const res = evaluatePolicy({
      agent: mockAgent,
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 4900, // $49.00
      currency: 'USD',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T2: Amount above threshold requires approval', res.decision === 'PENDING_APPROVAL');
    assert('T2: Reason code is HUMAN_APPROVAL_REQUIRED', res.reasonCodes.includes('HUMAN_APPROVAL_REQUIRED'));
  }

  // Test 3: Amount strictly exceeding $100 max per-transaction -> DENIED
  {
    const res = evaluatePolicy({
      agent: mockAgent,
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 18000, // $180.00
      currency: 'USD',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T3: $180 exceeds max per txn and is DENIED', res.decision === 'DENIED');
    assert('T3: Reason code is AMOUNT_EXCEEDS_TRANSACTION_LIMIT', res.reasonCodes.includes('AMOUNT_EXCEEDS_TRANSACTION_LIMIT'));
  }

  // Test 4: Daily limit breach (e.g. $49 settled, new request $80 = $129 > $120 limit) -> DENIED
  {
    const res = evaluatePolicy({
      agent: mockAgent,
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 8000, // $80.00
      currency: 'USD',
      dailySpentAndReservedMinor: 4900, // $49.00
      monthlySpentAndReservedMinor: 4900,
    });
    assert('T4: Daily limit breach is DENIED', res.decision === 'DENIED');
    assert('T4: Reason code is DAILY_LIMIT_EXCEEDED', res.reasonCodes.includes('DAILY_LIMIT_EXCEEDED'));
  }

  // Test 5: Revoked agent cannot initiate payment
  {
    const res = evaluatePolicy({
      agent: { ...mockAgent, status: 'REVOKED' },
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 1000,
      currency: 'USD',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T5: Revoked agent is DENIED', res.decision === 'DENIED');
    assert('T5: Reason code is AGENT_REVOKED', res.reasonCodes.includes('AGENT_REVOKED'));
  }

  // Test 6: Paused agent cannot initiate payment
  {
    const res = evaluatePolicy({
      agent: { ...mockAgent, status: 'PAUSED' },
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 1000,
      currency: 'USD',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T6: Paused agent is DENIED', res.decision === 'DENIED');
    assert('T6: Reason code is AGENT_INACTIVE', res.reasonCodes.includes('AGENT_INACTIVE'));
  }

  // Test 7: Blocked recipient
  {
    const res = evaluatePolicy({
      agent: mockAgent,
      policyVersion: mockPolicy,
      recipient: { ...mockRecipient, status: 'BLOCKED' },
      recipientEmail: mockRecipient.email,
      amountMinor: 1000,
      currency: 'USD',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T7: Blocked recipient is DENIED', res.decision === 'DENIED');
    assert('T7: Reason is RECIPIENT_NOT_APPROVED', res.reasonCodes.includes('RECIPIENT_NOT_APPROVED'));
  }

  // Test 8: Disallowed currency
  {
    const res = evaluatePolicy({
      agent: mockAgent,
      policyVersion: mockPolicy,
      recipient: mockRecipient,
      recipientEmail: mockRecipient.email,
      amountMinor: 1000,
      currency: 'EUR',
      dailySpentAndReservedMinor: 0,
      monthlySpentAndReservedMinor: 0,
    });
    assert('T8: Non-allowlisted currency is DENIED', res.decision === 'DENIED');
    assert('T8: Reason is CURRENCY_NOT_ALLOWED', res.reasonCodes.includes('CURRENCY_NOT_ALLOWED'));
  }

  return { passed, failed, errors };
}
