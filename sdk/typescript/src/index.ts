export { CountersignAgentApiClient } from "./client.js";
export type { ClientOptions } from "./client-options.js";

export type { TokenProvider } from "./core/auth/credentials.js";

export { PaymentIntents } from "./resources/payment-intents.js";
export { AgentApi } from "./resources/agent-api.js";
export { System } from "./resources/system.js";

export { agentSchema, type Agent } from "./models/agent.js";
export { approvalSchema, type Approval } from "./models/approval.js";
export { ApprovalMode, approvalModeSchema } from "./models/approval-mode.js";
export { budgetReservationSchema, type BudgetReservation } from "./models/budget-reservation.js";
export { Decision, decisionSchema } from "./models/decision.js";
export { Decision1, decision1Schema } from "./models/decision1.js";
export { errorSchema, type Error } from "./models/error.js";
export { errorErrorSchema, type ErrorError } from "./models/error-error.js";
export { evaluationCheckSchema, type EvaluationCheck } from "./models/evaluation-check.js";
export { healthSchema, type Health } from "./models/health.js";
export { IdempotentReplay, idempotentReplaySchema } from "./models/idempotent-replay.js";
export { moneySchema, type Money } from "./models/money.js";
export { paymentIntentSchema, type PaymentIntent } from "./models/payment-intent.js";
export { paymentIntentRequestSchema, type PaymentIntentRequest } from "./models/payment-intent-request.js";
export { paymentIntentErrorSchema, type PaymentIntentError } from "./models/payment-intent-error.js";
export { PaymentStatus, paymentStatusSchema } from "./models/payment-status.js";
export { payoutRecordSchema, type PayoutRecord } from "./models/payout-record.js";
export { policyVersionSchema, type PolicyVersion } from "./models/policy-version.js";
export { ReasonCode, reasonCodeSchema } from "./models/reason-code.js";
export { recipientSchema, type Recipient } from "./models/recipient.js";
export { recipientSnapshotSchema, type RecipientSnapshot } from "./models/recipient-snapshot.js";
export { Status, statusSchema } from "./models/status.js";
export { Status1, status1Schema } from "./models/status1.js";
export { Status2, status2Schema } from "./models/status2.js";
export { Status3, status3Schema } from "./models/status3.js";

export {
  CoreError as CountersignAgentApiError,
  ResponseError,
  DecodeError,
  EncodeError,
  ConnectionError,
  TimeoutError,
  AuthError,
  PaginationError,
  ConfigurationError,
} from "./core/errors.js";
export { ApiError } from "./core/api-error.js";
export { SchemaError } from "./core/validation/schema-error.js";
export {
  defaultLoggingOptions,
  type LoggingOptions,
  type RequestLoggingOptions,
  type Logger,
  type LogDetails,
  type HttpRequestDetails,
  type RequestHeadersDetails,
  type RequestBodyDetails,
  type HttpResponseDetails,
  type ResponseHeadersDetails,
  type HttpRetryingDetails,
  type HttpFailedDetails,
  type LogLevel,
} from "./core/logging.js";
export type { ApiPromise, ApiResult } from "./core/api-promise.js";
export type { Pageable, PageableApiResult } from "./core/pagination/pageable.js";
export type { HttpMethod, RequestOptions } from "./core/api-request.js";
export type { RetryOptions, RequestRetryOptions, RetryAttempt, RetryReason } from "./core/retry.js";
export type { BinaryContent, BinaryData, BinaryErrorContent, FileData, FileInput } from "./core/binary.js";
export type { ErrorKind } from "./core/errors.js";
export type { Declared, Undeclared } from "./core/api-error.js";
export type { Schema, EnumSchema, Encoded, ValidationResult, JsonValue } from "./core/validation/schema.js";
