import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { status1Schema, type Status1 } from "./status1.js";

/** Budget held for the intent until the payout settles or is released. */
export type BudgetReservation = {
  /** Unique id of the reservation. */
  id?: string;
  /** Id of the payment intent the budget is held for. */
  paymentIntentId?: string;
  /** Id of the agent whose budget is held. */
  agentId?: string;
  /** Amount held, in minor units (cents). */
  amountMinor?: number;
  /** ISO currency code of the held amount. */
  currency?: string;
  /** `HELD` while pending, `SETTLED` once PayPal confirms, `RELEASED` or `EXPIRED` if not spent. */
  status?: Status1;
  /** When the budget was reserved (UTC). */
  createdAt?: Date;
  /** When an unapproved reservation expires and is released (UTC). */
  expiresAt?: Date;
  /** When the reservation was released (UTC). Null unless released. */
  releasedAt?: Date | null;
  /** When the reservation settled (UTC). Null until PayPal confirms. */
  settledAt?: Date | null;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const budgetReservationSchema: Schema<BudgetReservation> = s.object<BudgetReservation>(
  {
    id: s.optional(s.string()),
    paymentIntentId: s.optional(s.string()),
    agentId: s.optional(s.string()),
    amountMinor: s.optional(s.int()),
    currency: s.optional(s.string()),
    status: s.optional(s.lazy(() => status1Schema)),
    createdAt: s.optional(s.dateTime()),
    expiresAt: s.optional(s.dateTime()),
    releasedAt: s.optionalNullable(s.dateTime()),
    settledAt: s.optionalNullable(s.dateTime()),
  },
  { additionalProperties: s.json() },
);
