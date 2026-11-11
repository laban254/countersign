import { computeLedgerHash, verifyLedgerChain, GENESIS_HASH } from '../src/server/ledger.ts';
import { LedgerEvent } from '../src/domain/types.ts';

function makeEvent(
  prevHash: string,
  id: number,
  payload: Record<string, unknown>,
  overrides: Partial<Omit<LedgerEvent, 'hash' | 'prevHash'>> = {},
  secret = 'test_secret_key_123'
): LedgerEvent {
  const record = {
    id,
    workspaceId: 'ws_001',
    agentId: null,
    paymentIntentId: null,
    eventType: 'INTENT_RECEIVED' as const,
    actorType: 'SYSTEM' as const,
    actorId: 'system',
    payload,
    createdAt: new Date(2026, 10, 7, 12, 0, id).toISOString(),
    ...overrides,
  };
  return {
    ...record,
    prevHash,
    hash: computeLedgerHash(prevHash, record, secret),
  };
}

export function runLedgerTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(name: string, condition: boolean, detail = '') {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`FAILED: ${name} ${detail}`);
    }
  }

  const secret = 'test_secret_key_123';

  const e1 = makeEvent(GENESIS_HASH, 1, { message: 'Genesis block' }, {
    eventType: 'GENESIS',
  }, secret);
  const e2 = makeEvent(e1.hash, 2, { intentId: 'pi_001', amountMinor: 4900 }, {
    agentId: 'agt_001',
    paymentIntentId: 'pi_001',
    actorType: 'AGENT',
    actorId: 'agt_001',
  }, secret);

  const chain = [e1, e2];
  const validRes = verifyLedgerChain(chain, secret);
  assert(
    'T1: Valid chain passes verification',
    validRes.valid === true && validRes.totalEvents === 2
  );
  assert('T1: Head hash is returned', validRes.headHash === e2.hash);

  const tamperedPayload: LedgerEvent[] = [
    e1,
    { ...e2, payload: { intentId: 'pi_001', amountMinor: 999999 } },
  ];
  assert(
    'T2: Tampered payload is caught and rejected',
    verifyLedgerChain(tamperedPayload, secret).valid === false
  );

  const brokenLinkChain: LedgerEvent[] = [
    e1,
    {
      ...e2,
      prevHash: '1111111111111111111111111111111111111111111111111111111111111111',
    },
  ];
  assert(
    'T3: Broken previous hash is caught',
    verifyLedgerChain(brokenLinkChain, secret).valid === false
  );

  // Metadata is part of the audit claim, not just the payload.
  const tamperedEventType: LedgerEvent[] = [
    e1,
    { ...e2, eventType: 'PAYOUT_SUCCEEDED' },
  ];
  assert(
    'T4: Tampering eventType is caught',
    verifyLedgerChain(tamperedEventType, secret).valid === false
  );

  const tamperedActor: LedgerEvent[] = [
    e1,
    { ...e2, actorId: 'attacker' },
  ];
  assert(
    'T5: Tampering actorId is caught',
    verifyLedgerChain(tamperedActor, secret).valid === false
  );

  const tamperedTimestamp: LedgerEvent[] = [
    e1,
    { ...e2, createdAt: new Date(0).toISOString() },
  ];
  assert(
    'T6: Tampering createdAt is caught',
    verifyLedgerChain(tamperedTimestamp, secret).valid === false
  );

  const reordered: LedgerEvent[] = [e2, e1];
  assert(
    'T7: Reordered events are caught',
    verifyLedgerChain(reordered, secret).valid === false
  );

  return { passed, failed, errors };
}
