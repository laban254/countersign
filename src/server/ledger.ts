import crypto from 'node:crypto';
import { LedgerEvent } from '../domain/types.ts';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
const DEV_ONLY_SECRET = 'countersign_dev_only_ledger_secret_2026';

let warnedAboutDevSecret = false;

/**
 * The ledger HMAC key must be supplied explicitly in production. A hardcoded
 * fallback would let anyone who reads the source forge the whole chain.
 */
export function getLedgerSecret(): string {
  const secret = process.env.LEDGER_HASH_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('LEDGER_HASH_SECRET is required in production (minimum 16 characters).');
  }

  if (!warnedAboutDevSecret) {
    warnedAboutDevSecret = true;
    console.warn(
      '[Countersign] LEDGER_HASH_SECRET is not set. Using a development-only ledger secret.'
    );
  }
  return DEV_ONLY_SECRET;
}

export function assertLedgerSecretConfig(): void {
  getLedgerSecret();
}

/**
 * Deterministic JSON stringifier to guarantee identical string representation
 * regardless of key insertion order.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJson(item)).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const entries = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalJson(val)}`;
  });
  return '{' + entries.join(',') + '}';
}

export type LedgerEventHashInput = Omit<LedgerEvent, 'hash' | 'prevHash'>;

/**
 * Hash the complete event record, not just its payload. Event type, actor,
 * timestamps, and intent/agent references are all part of the audit claim and
 * must be covered by the chain.
 */
export function computeLedgerHash(
  prevHash: string,
  record: LedgerEventHashInput,
  secret = getLedgerSecret()
): string {
  const canonical = canonicalJson({
    id: record.id,
    workspaceId: record.workspaceId,
    agentId: record.agentId,
    paymentIntentId: record.paymentIntentId,
    eventType: record.eventType,
    actorType: record.actorType,
    actorId: record.actorId,
    payload: record.payload,
    createdAt: record.createdAt,
  });
  const data = `${prevHash}:${canonical}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

export function verifyLedgerChain(
  events: LedgerEvent[],
  secret = getLedgerSecret()
): {
  valid: boolean;
  totalEvents: number;
  headHash: string;
  brokenIndex?: number;
  reason?: string;
} {
  if (events.length === 0) {
    return { valid: true, totalEvents: 0, headHash: GENESIS_HASH };
  }

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const expectedPrev = i === 0 ? GENESIS_HASH : events[i - 1].hash;

    if (current.prevHash !== expectedPrev) {
      return {
        valid: false,
        totalEvents: events.length,
        headHash: events[events.length - 1].hash,
        brokenIndex: i,
        reason: `Previous hash mismatch at event #${current.id}. Expected ${expectedPrev.substring(0, 10)}... got ${current.prevHash.substring(0, 10)}...`,
      };
    }

    if (i > 0 && current.id <= events[i - 1].id) {
      return {
        valid: false,
        totalEvents: events.length,
        headHash: events[events.length - 1].hash,
        brokenIndex: i,
        reason: `Event ordering failure at event #${current.id}. Ledger IDs must be strictly increasing.`,
      };
    }

    const recomputedHash = computeLedgerHash(
      current.prevHash,
      {
        id: current.id,
        workspaceId: current.workspaceId,
        agentId: current.agentId,
        paymentIntentId: current.paymentIntentId,
        eventType: current.eventType,
        actorType: current.actorType,
        actorId: current.actorId,
        payload: current.payload,
        createdAt: current.createdAt,
      },
      secret
    );

    if (current.hash !== recomputedHash) {
      return {
        valid: false,
        totalEvents: events.length,
        headHash: events[events.length - 1].hash,
        brokenIndex: i,
        reason: `Hash integrity failure at event #${current.id}. Stored ${current.hash.substring(0, 10)}... but recalculation yielded ${recomputedHash.substring(0, 10)}...`,
      };
    }
  }

  return {
    valid: true,
    totalEvents: events.length,
    headHash: events[events.length - 1].hash,
  };
}
