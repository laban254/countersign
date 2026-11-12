import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";

export type Health = {
  /** Overall service status. */
  status: string;
  /** Name of the service. */
  service: string;
  /** Server time when the check ran (UTC). */
  timestamp: Date;
  /** Whether the tamper-evident ledger hash chain currently verifies. */
  ledgerChainValid: boolean;
  /** Hash of the newest ledger block. Publish it externally to detect tail truncation. */
  ledgerHeadHash?: string;
  /** Whether the console requires an access token. */
  authRequired?: boolean;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const healthSchema: Schema<Health> = s.object<Health>(
  {
    status: s.string(),
    service: s.string(),
    timestamp: s.dateTime(),
    ledgerChainValid: s.boolean(),
    ledgerHeadHash: s.optional(s.string()),
    authRequired: s.optional(s.boolean()),
  },
  { additionalProperties: s.json() },
);
