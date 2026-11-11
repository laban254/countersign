export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED';

export type ApprovalMode = 'NEVER' | 'ABOVE_THRESHOLD' | 'ALWAYS';

export type PolicyVersionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type Decision = 'AUTHORIZED' | 'PENDING_APPROVAL' | 'DENIED';

export type PaymentStatus =
  | 'RECEIVED'
  | 'DENIED'
  | 'PENDING_APPROVAL'
  | 'REJECTED'
  | 'EXPIRED'
  | 'APPROVED'
  | 'EXECUTING'
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNCLAIMED'
  | 'RETURNED'
  | 'HELD'
  | 'BLOCKED'
  | 'REFUNDED';

export type ReservationStatus = 'HELD' | 'SETTLED' | 'RELEASED' | 'EXPIRED';

export type ReasonCode =
  | 'AGENT_INACTIVE'
  | 'AGENT_REVOKED'
  | 'NO_ACTIVE_POLICY'
  | 'INVALID_REQUEST'
  | 'CURRENCY_NOT_ALLOWED'
  | 'AMOUNT_NOT_POSITIVE'
  | 'AMOUNT_EXCEEDS_TRANSACTION_LIMIT'
  | 'RECIPIENT_NOT_APPROVED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'MONTHLY_LIMIT_EXCEEDED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'NEW_RECIPIENT_APPROVAL_REQUIRED'
  | 'POLICY_CHANGED_SINCE_APPROVAL'
  | 'PAYMENT_EXECUTION_UNAVAILABLE';

export interface EvaluationCheck {
  id: string;
  label: string;
  status: 'passed' | 'warning' | 'failed';
  detail?: string;
}

export interface PolicyEvaluationResult {
  decision: Decision;
  reasonCodes: ReasonCode[];
  explanation: string;
  checks: EvaluationCheck[];
  policyId: string;
  policyVersion: number;
  evaluatedAt: string;
}

export interface PolicyVersion {
  id: string;
  policyId: string;
  version: number;
  maxTransactionMinor: number;
  dailyLimitMinor: number;
  monthlyLimitMinor: number;
  approvalMode: ApprovalMode;
  approvalThresholdMinor: number | null;
  allowNewRecipients: boolean;
  currencyAllowlist: string[];
  status: PolicyVersionStatus;
  createdBy: string;
  createdAt: string;
  changeNote?: string;
}

export interface Policy {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  activeVersionId: string | null;
  createdAt: string;
  versions: PolicyVersion[];
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  tokenPrefix: string;
  tokenHash: string;
  status: AgentStatus;
  activePolicyVersionId: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Recipient {
  id: string;
  workspaceId: string;
  displayName: string;
  email: string;
  status: 'APPROVED' | 'BLOCKED';
  createdAt: string;
  createdBy: string;
}

export interface BudgetReservation {
  id: string;
  paymentIntentId: string;
  agentId: string;
  amountMinor: number;
  currency: string;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: string;
  releasedAt: string | null;
  settledAt: string | null;
}

export interface Approval {
  id: string;
  paymentIntentId: string;
  requestedAt: string;
  expiresAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  comment?: string;
  snapshotHash: string;
}

export interface PayPalPayoutRecord {
  id: string;
  paymentIntentId: string;
  payoutBatchId: string;
  payoutItemId: string;
  transactionId: string | null;
  batchStatus: string;
  itemStatus: string;
  rawResponse: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  id: string;
  workspaceId: string;
  agentId: string;
  agentName: string;
  policyVersionId: string;
  policySnapshot: PolicyVersion;
  recipientId: string | null;
  recipientSnapshot: {
    displayName: string;
    email: string;
    status: 'APPROVED' | 'BLOCKED' | 'NEW';
  };
  amountMinor: number;
  currency: string;
  description: string;
  invoiceReference: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string;
  requestHash: string;
  decision: Decision;
  status: PaymentStatus;
  reasonCodes: ReasonCode[];
  explanation: string;
  checks: EvaluationCheck[];
  approval?: Approval;
  reservation?: BudgetReservation;
  payout?: PayPalPayoutRecord;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEvent {
  id: number;
  workspaceId: string;
  agentId: string | null;
  paymentIntentId: string | null;
  eventType:
    | 'GENESIS'
    | 'AGENT_REGISTERED'
    | 'AGENT_STATUS_UPDATED'
    | 'AGENT_TOKEN_ROTATED'
    | 'POLICY_CREATED'
    | 'POLICY_VERSION_CREATED'
    | 'POLICY_VERSION_ACTIVATED'
    | 'RECIPIENT_ADDED'
    | 'RECIPIENT_STATUS_UPDATED'
    | 'INTENT_RECEIVED'
    | 'POLICY_EVALUATED'
    | 'INTENT_REVALIDATED'
    | 'INTENT_REVALIDATION_FAILED'
    | 'INTENT_EXPIRED'
    | 'BUDGET_RESERVED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVAL_EXPIRED'
    | 'APPROVAL_GRANTED'
    | 'APPROVAL_REJECTED'
    | 'PAYOUT_SUBMITTED'
    | 'PAYOUT_SUCCEEDED'
    | 'PAYOUT_FAILED'
    | 'PAYOUT_STATUS_CHANGED'
    | 'RESERVATION_SETTLED'
    | 'RESERVATION_RELEASED'
    | 'WEBHOOK_RECEIVED';
  actorType: 'USER' | 'AGENT' | 'SYSTEM' | 'PAYPAL' | 'AI';
  actorId: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface PayPalWebhookEvent {
  id: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  signatureVerified: boolean;
  processingStatus: 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED';
  receivedAt: string;
  processedAt: string | null;
}

export interface SpendingSummary {
  workspaceId: string;
  agentId?: string;
  currency: string;
  dailyLimitMinor: number;
  monthlyLimitMinor: number;
  dailySettledMinor: number;
  dailyReservedMinor: number;
  dailyAvailableMinor: number;
  monthlySettledMinor: number;
  monthlyReservedMinor: number;
  monthlyAvailableMinor: number;
}
