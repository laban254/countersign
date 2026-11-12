import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { decision1Schema, type Decision1 } from "./decision1.js";

/** The human countersign record for an intent that needed one. */
export type Approval = {
  /** Unique id of the approval record. */
  id?: string;
  /** Id of the payment intent being approved. */
  paymentIntentId?: string;
  /** When approval was requested (UTC). */
  requestedAt?: Date;
  /** When the pending approval expires and its reservation is released (UTC). */
  expiresAt?: Date;
  /** When a human reviewed the request (UTC). Null while pending. */
  reviewedAt?: Date | null;
  /** Name of the human reviewer. Null while pending. */
  reviewedBy?: string | null;
  /** The reviewer's decision. Null while pending. */
  decision?: Decision1 | null;
  /** Optional reviewer comment. */
  comment?: string;
  /** Hash of the exact request the approval is bound to. */
  snapshotHash?: string;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const approvalSchema: Schema<Approval> = s.object<Approval>(
  {
    id: s.optional(s.string()),
    paymentIntentId: s.optional(s.string()),
    requestedAt: s.optional(s.dateTime()),
    expiresAt: s.optional(s.dateTime()),
    reviewedAt: s.optionalNullable(s.dateTime()),
    reviewedBy: s.optionalNullable(s.string()),
    decision: s.optionalNullable(s.lazy(() => decision1Schema)),
    comment: s.optional(s.string()),
    snapshotHash: s.optional(s.string()),
  },
  { additionalProperties: s.json() },
);
