import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Lifecycle status of the intent. */
export const PaymentStatus = {
  Received: "RECEIVED",
  Denied: "DENIED",
  PendingApproval: "PENDING_APPROVAL",
  Rejected: "REJECTED",
  Expired: "EXPIRED",
  Approved: "APPROVED",
  Executing: "EXECUTING",
  Pending: "PENDING",
  Processing: "PROCESSING",
  Succeeded: "SUCCEEDED",
  Failed: "FAILED",
  Unclaimed: "UNCLAIMED",
  Returned: "RETURNED",
  Held: "HELD",
  Blocked: "BLOCKED",
  Refunded: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus] | (string & {});

export const paymentStatusSchema: EnumSchema<PaymentStatus> = s.enumOf<PaymentStatus>(PaymentStatus);
