import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { approvalSchema, type Approval } from "./approval.js";
import { budgetReservationSchema, type BudgetReservation } from "./budget-reservation.js";
import { decisionSchema, type Decision } from "./decision.js";
import { evaluationCheckSchema, type EvaluationCheck } from "./evaluation-check.js";
import { paymentStatusSchema, type PaymentStatus } from "./payment-status.js";
import { payoutRecordSchema, type PayoutRecord } from "./payout-record.js";
import { policyVersionSchema, type PolicyVersion } from "./policy-version.js";
import { reasonCodeSchema, type ReasonCode } from "./reason-code.js";
import {
  recipientSnapshotInternalSchema,
  recipientSnapshotSchema,
  type RecipientSnapshot,
} from "./recipient-snapshot.js";

export type PaymentIntent = {
  /** Unique id of the payment intent. */
  id: string;
  /** Workspace the intent belongs to. */
  workspaceId?: string;
  /** Id of the agent that requested the payment. */
  agentId: string;
  /** Display name of the requesting agent. */
  agentName?: string;
  /** Id of the policy version the decision was made under. */
  policyVersionId?: string;
  /** Immutable snapshot of the policy version the decision was made under. */
  policySnapshot?: PolicyVersion;
  /** Id of the matching approved recipient. Null when the recipient was not on the allowlist. */
  recipientId?: string | null;
  /** The recipient exactly as it was when the decision was made. */
  recipientSnapshot?: RecipientSnapshot;
  /** Amount in minor units (cents). 4900 is $49.00. */
  amountMinor: number;
  /** ISO currency code. */
  currency: string;
  /** Payment memo supplied by the agent. */
  description?: string;
  /** Reference supplied by the agent, or generated. */
  invoiceReference?: string;
  /** Free-form data supplied with the request. */
  metadata?: Record<string, unknown>;
  /** Idempotency key the intent was created with. */
  idempotencyKey?: string;
  /** SHA-256 hash of the canonical request, used to detect key reuse with a different body. */
  requestHash?: string;
  /** The policy engine's verdict. */
  decision: Decision;
  /** Lifecycle status of the intent. */
  status: PaymentStatus;
  /** Machine-readable reasons behind the decision. */
  reasonCodes: ReasonCode[];
  /** Plain-language explanation of the decision. */
  explanation: string;
  /** The individual deterministic policy checks, in evaluation order. */
  checks: EvaluationCheck[];
  /** The human countersign record for an intent that needed one. */
  approval?: Approval;
  /** Budget held for the intent until the payout settles or is released. */
  reservation?: BudgetReservation;
  /** PayPal Payouts references for an executed payment. */
  payout?: PayoutRecord;
  /** When the intent was received (UTC). */
  createdAt: Date;
  /** When the intent last changed (UTC). */
  updatedAt?: Date;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

const paymentIntentProperties: s.Shape<PaymentIntent> = {
  id: s.string(),
  workspaceId: s.optional(s.string()),
  agentId: s.string(),
  agentName: s.optional(s.string()),
  policyVersionId: s.optional(s.string()),
  policySnapshot: s.optional(s.lazy(() => policyVersionSchema)),
  recipientId: s.optionalNullable(s.string()),
  recipientSnapshot: s.optional(s.lazy(() => recipientSnapshotInternalSchema)),
  amountMinor: s.int(),
  currency: s.string(),
  description: s.optional(s.string()),
  invoiceReference: s.optional(s.string()),
  metadata: s.optional(s.record(s.string(), s.unknown())),
  idempotencyKey: s.optional(s.string()),
  requestHash: s.optional(s.string()),
  decision: decisionSchema,
  status: paymentStatusSchema,
  reasonCodes: s.array(s.lazy(() => reasonCodeSchema)),
  explanation: s.string(),
  checks: s.array(s.lazy(() => evaluationCheckSchema)),
  approval: s.optional(s.lazy(() => approvalSchema)),
  reservation: s.optional(s.lazy(() => budgetReservationSchema)),
  payout: s.optional(s.lazy(() => payoutRecordSchema)),
  createdAt: s.dateTime(),
  updatedAt: s.optional(s.dateTime()),
};

export const paymentIntentInternalSchema: Schema<PaymentIntent> = s.object<PaymentIntent>(
  paymentIntentProperties,
  { additionalProperties: s.json() },
);

export const paymentIntentSchema: Schema<PaymentIntent> = s.lazySchema(() =>
  s.object<PaymentIntent>(
    {
      ...paymentIntentProperties,
      recipientSnapshot: s.optional(s.lazy(() => recipientSnapshotSchema)),
    },
    { additionalProperties: s.json() },
  ),
);
