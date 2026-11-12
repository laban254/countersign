import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";

/** PayPal Payouts references for an executed payment. */
export type PayoutRecord = {
  /** Unique id of the payout record. */
  id?: string;
  /** Id of the payment intent that was paid. */
  paymentIntentId?: string;
  /** PayPal payout batch id. */
  payoutBatchId?: string;
  /** PayPal payout item id. */
  payoutItemId?: string;
  /** PayPal transaction id, available once the payout has completed. */
  transactionId?: string | null;
  /** PayPal batch status, for example `PENDING` or `SUCCESS`. */
  batchStatus?: string;
  /** PayPal item status, for example `PENDING` or `SUCCESS`. */
  itemStatus?: string;
  /** When the payout was submitted (UTC). */
  createdAt?: Date;
  /** When the payout record last changed (UTC). */
  updatedAt?: Date;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const payoutRecordSchema: Schema<PayoutRecord> = s.object<PayoutRecord>(
  {
    id: s.optional(s.string()),
    paymentIntentId: s.optional(s.string()),
    payoutBatchId: s.optional(s.string()),
    payoutItemId: s.optional(s.string()),
    transactionId: s.optionalNullable(s.string()),
    batchStatus: s.optional(s.string()),
    itemStatus: s.optional(s.string()),
    createdAt: s.optional(s.dateTime()),
    updatedAt: s.optional(s.dateTime()),
  },
  { additionalProperties: s.json() },
);
