import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { approvalModeSchema, type ApprovalMode } from "./approval-mode.js";

/** Immutable snapshot of the policy version the decision was made under. */
export type PolicyVersion = {
  /** Unique id of this policy version. */
  id?: string;
  /** Id of the policy this version belongs to. */
  policyId?: string;
  /** Version number, increasing with each change. */
  version?: number;
  /** Per-transaction cap in minor units (cents). */
  maxTransactionMinor?: number;
  /** Daily spending cap in minor units (cents), counting settled plus reserved spend. */
  dailyLimitMinor?: number;
  /** Monthly spending cap in minor units (cents). */
  monthlyLimitMinor?: number;
  /** When a human countersign is required: never, above a threshold, or always. */
  approvalMode?: ApprovalMode;
  /**
   * Amount above which approval is required, in minor units. Null unless the mode is
   * `ABOVE_THRESHOLD`.
   */
  approvalThresholdMinor?: number | null;
  /** Whether payments to recipients not on the allowlist may proceed (with approval). */
  allowNewRecipients?: boolean;
  /** Currencies the agent may pay in. */
  currencyAllowlist?: string[];
  /** Lifecycle status of the version, for example `ACTIVE` or `ARCHIVED`. */
  status?: string;
  /** Who created the version. */
  createdBy?: string;
  /** When the version was created (UTC). */
  createdAt?: Date;
  /** Free-text note describing why the version was created. */
  changeNote?: string;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const policyVersionSchema: Schema<PolicyVersion> = s.object<PolicyVersion>(
  {
    id: s.optional(s.string()),
    policyId: s.optional(s.string()),
    version: s.optional(s.int()),
    maxTransactionMinor: s.optional(s.int()),
    dailyLimitMinor: s.optional(s.int()),
    monthlyLimitMinor: s.optional(s.int()),
    approvalMode: s.optional(s.lazy(() => approvalModeSchema)),
    approvalThresholdMinor: s.optionalNullable(s.int()),
    allowNewRecipients: s.optional(s.boolean()),
    currencyAllowlist: s.optional(s.array(s.string())),
    status: s.optional(s.string()),
    createdBy: s.optional(s.string()),
    createdAt: s.optional(s.dateTime()),
    changeNote: s.optional(s.string()),
  },
  { additionalProperties: s.json() },
);
