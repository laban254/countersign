import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Machine-readable reason behind a decision. */
export const ReasonCode = {
  AgentInactive: "AGENT_INACTIVE",
  AgentRevoked: "AGENT_REVOKED",
  NoActivePolicy: "NO_ACTIVE_POLICY",
  InvalidRequest: "INVALID_REQUEST",
  CurrencyNotAllowed: "CURRENCY_NOT_ALLOWED",
  AmountNotPositive: "AMOUNT_NOT_POSITIVE",
  AmountExceedsTransactionLimit: "AMOUNT_EXCEEDS_TRANSACTION_LIMIT",
  RecipientNotApproved: "RECIPIENT_NOT_APPROVED",
  DailyLimitExceeded: "DAILY_LIMIT_EXCEEDED",
  MonthlyLimitExceeded: "MONTHLY_LIMIT_EXCEEDED",
  HumanApprovalRequired: "HUMAN_APPROVAL_REQUIRED",
  NewRecipientApprovalRequired: "NEW_RECIPIENT_APPROVAL_REQUIRED",
  PolicyChangedSinceApproval: "POLICY_CHANGED_SINCE_APPROVAL",
  PaymentExecutionUnavailable: "PAYMENT_EXECUTION_UNAVAILABLE",
} as const;
export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode] | (string & {});

export const reasonCodeSchema: EnumSchema<ReasonCode> = s.enumOf<ReasonCode>(ReasonCode);
