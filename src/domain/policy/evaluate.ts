import {
  Agent,
  PolicyVersion,
  Recipient,
  PolicyEvaluationResult,
  ReasonCode,
  Decision,
  EvaluationCheck,
} from '../types.ts';
import { formatUSD } from '../money.ts';

export interface EvaluationInput {
  agent: Agent;
  policyVersion: PolicyVersion | null;
  recipient: Recipient | null;
  recipientEmail: string;
  recipientName?: string;
  amountMinor: number;
  currency: string;
  dailySpentAndReservedMinor: number;
  monthlySpentAndReservedMinor: number;
}

export function evaluatePolicy(input: EvaluationInput): PolicyEvaluationResult {
  const {
    agent,
    policyVersion,
    recipient,
    recipientEmail,
    amountMinor,
    currency,
    dailySpentAndReservedMinor,
    monthlySpentAndReservedMinor,
  } = input;

  const checks: EvaluationCheck[] = [];
  const evaluatedAt = new Date().toISOString();

  // 1. Agent status
  if (agent.status === 'REVOKED') {
    return {
      decision: 'DENIED',
      reasonCodes: ['AGENT_REVOKED'],
      explanation: `Agent '${agent.name}' is revoked and cannot initiate payments.`,
      checks: [
        { id: 'agent_status', label: 'Agent active', status: 'failed', detail: 'Agent is REVOKED' },
      ],
      policyId: policyVersion?.policyId ?? 'none',
      policyVersion: policyVersion?.version ?? 0,
      evaluatedAt,
    };
  }

  if (agent.status === 'PAUSED') {
    return {
      decision: 'DENIED',
      reasonCodes: ['AGENT_INACTIVE'],
      explanation: `Agent '${agent.name}' is currently paused.`,
      checks: [
        { id: 'agent_status', label: 'Agent active', status: 'failed', detail: 'Agent is PAUSED' },
      ],
      policyId: policyVersion?.policyId ?? 'none',
      policyVersion: policyVersion?.version ?? 0,
      evaluatedAt,
    };
  }

  checks.push({ id: 'agent_status', label: 'Agent active', status: 'passed' });

  // 2. Active policy version
  if (!policyVersion || policyVersion.status !== 'ACTIVE') {
    return {
      decision: 'DENIED',
      reasonCodes: ['NO_ACTIVE_POLICY'],
      explanation: `No active policy version assigned to agent '${agent.name}'.`,
      checks: [
        ...checks,
        { id: 'policy_active', label: 'Active policy version', status: 'failed', detail: 'No active policy assigned' },
      ],
      policyId: 'none',
      policyVersion: 0,
      evaluatedAt,
    };
  }

  // 3. Schema validation
  if (!recipientEmail || !recipientEmail.includes('@') || amountMinor === undefined || isNaN(amountMinor)) {
    return {
      decision: 'DENIED',
      reasonCodes: ['INVALID_REQUEST'],
      explanation: 'Invalid request payload or malformed recipient email address.',
      checks: [
        ...checks,
        { id: 'schema_valid', label: 'Valid request structure', status: 'failed' },
      ],
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }

  // 4. Currency allowlist
  const isCurrencyAllowed = policyVersion.currencyAllowlist.includes(currency.toUpperCase());
  if (!isCurrencyAllowed) {
    return {
      decision: 'DENIED',
      reasonCodes: ['CURRENCY_NOT_ALLOWED'],
      explanation: `Currency '${currency}' is not in policy allowlist [${policyVersion.currencyAllowlist.join(', ')}].`,
      checks: [
        ...checks,
        { id: 'currency_allowed', label: `Currency in allowlist (${currency})`, status: 'failed' },
      ],
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }

  // 5. Positive amount
  if (amountMinor <= 0) {
    return {
      decision: 'DENIED',
      reasonCodes: ['AMOUNT_NOT_POSITIVE'],
      explanation: 'Payment amount must be greater than zero.',
      checks: [
        ...checks,
        { id: 'positive_amount', label: 'Amount strictly positive', status: 'failed' },
      ],
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }

  // 6. Max transaction limit
  const maxTxnCheckPassed = amountMinor <= policyVersion.maxTransactionMinor;
  if (!maxTxnCheckPassed) {
    checks.push({
      id: 'max_transaction',
      label: `Within ${formatUSD(policyVersion.maxTransactionMinor)} per-transaction limit`,
      status: 'failed',
      detail: `Requested ${formatUSD(amountMinor)} exceeds limit of ${formatUSD(policyVersion.maxTransactionMinor)}`,
    });
    return {
      decision: 'DENIED',
      reasonCodes: ['AMOUNT_EXCEEDS_TRANSACTION_LIMIT'],
      explanation: `Payment of ${formatUSD(amountMinor)} exceeds the per-transaction limit of ${formatUSD(policyVersion.maxTransactionMinor)}.`,
      checks,
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }
  checks.push({
    id: 'max_transaction',
    label: `Within ${formatUSD(policyVersion.maxTransactionMinor)} per-transaction limit`,
    status: 'passed',
  });

  // 7. Recipient allowlist check
  const isRecipientInAllowlist = recipient && recipient.status === 'APPROVED';
  const isRecipientBlocked = recipient && recipient.status === 'BLOCKED';

  if (isRecipientBlocked) {
    checks.push({
      id: 'recipient_check',
      label: 'Recipient approved',
      status: 'failed',
      detail: `Recipient '${recipientEmail}' is explicitly blocked`,
    });
    return {
      decision: 'DENIED',
      reasonCodes: ['RECIPIENT_NOT_APPROVED'],
      explanation: `Recipient '${recipientEmail}' is blocked in workspace allowlist.`,
      checks,
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }

  let isNewRecipientApproval = false;
  if (!isRecipientInAllowlist) {
    if (!policyVersion.allowNewRecipients) {
      checks.push({
        id: 'recipient_check',
        label: 'Recipient in approved list',
        status: 'failed',
        detail: `Recipient '${recipientEmail}' is not approved and policy disallows new recipients`,
      });
      return {
        decision: 'DENIED',
        reasonCodes: ['RECIPIENT_NOT_APPROVED'],
        explanation: `Recipient '${recipientEmail}' is not in approved list, and policy does not permit new recipients.`,
        checks,
        policyId: policyVersion.policyId,
        policyVersion: policyVersion.version,
        evaluatedAt,
      };
    } else {
      isNewRecipientApproval = true;
      checks.push({
        id: 'recipient_check',
        label: 'Recipient approved',
        status: 'warning',
        detail: `New recipient '${recipientEmail}' requires human approval`,
      });
    }
  } else {
    checks.push({
      id: 'recipient_check',
      label: 'Recipient approved',
      status: 'passed',
    });
  }

  // 8. Daily limit check (settled + reserved + this request)
  const projectedDailySpend = dailySpentAndReservedMinor + amountMinor;
  if (projectedDailySpend > policyVersion.dailyLimitMinor) {
    checks.push({
      id: 'daily_limit',
      label: `Within ${formatUSD(policyVersion.dailyLimitMinor)} daily limit`,
      status: 'failed',
      detail: `Current + requested (${formatUSD(projectedDailySpend)}) exceeds daily cap ${formatUSD(policyVersion.dailyLimitMinor)}`,
    });
    return {
      decision: 'DENIED',
      reasonCodes: ['DAILY_LIMIT_EXCEEDED'],
      explanation: `Payment would bring daily spend to ${formatUSD(projectedDailySpend)}, exceeding the daily limit of ${formatUSD(policyVersion.dailyLimitMinor)}.`,
      checks,
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }
  checks.push({
    id: 'daily_limit',
    label: `Within ${formatUSD(policyVersion.dailyLimitMinor)} daily limit (${formatUSD(projectedDailySpend)} of ${formatUSD(policyVersion.dailyLimitMinor)})`,
    status: 'passed',
  });

  // 9. Monthly limit check (settled + reserved + this request)
  const projectedMonthlySpend = monthlySpentAndReservedMinor + amountMinor;
  if (projectedMonthlySpend > policyVersion.monthlyLimitMinor) {
    checks.push({
      id: 'monthly_limit',
      label: `Within ${formatUSD(policyVersion.monthlyLimitMinor)} monthly limit`,
      status: 'failed',
      detail: `Current + requested (${formatUSD(projectedMonthlySpend)}) exceeds monthly cap ${formatUSD(policyVersion.monthlyLimitMinor)}`,
    });
    return {
      decision: 'DENIED',
      reasonCodes: ['MONTHLY_LIMIT_EXCEEDED'],
      explanation: `Payment would bring monthly spend to ${formatUSD(projectedMonthlySpend)}, exceeding the monthly limit of ${formatUSD(policyVersion.monthlyLimitMinor)}.`,
      checks,
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }
  checks.push({
    id: 'monthly_limit',
    label: `Within ${formatUSD(policyVersion.monthlyLimitMinor)} monthly limit (${formatUSD(projectedMonthlySpend)} of ${formatUSD(policyVersion.monthlyLimitMinor)})`,
    status: 'passed',
  });

  // 10. Approval conditions
  const reasonCodes: ReasonCode[] = [];
  let requiresApproval = false;

  if (isNewRecipientApproval) {
    requiresApproval = true;
    reasonCodes.push('NEW_RECIPIENT_APPROVAL_REQUIRED');
  }

  if (policyVersion.approvalMode === 'ALWAYS') {
    requiresApproval = true;
    if (!reasonCodes.includes('HUMAN_APPROVAL_REQUIRED')) {
      reasonCodes.push('HUMAN_APPROVAL_REQUIRED');
    }
    checks.push({
      id: 'approval_condition',
      label: 'Policy requires approval for all transactions',
      status: 'warning',
      detail: 'Approval mode is set to ALWAYS',
    });
  } else if (policyVersion.approvalMode === 'ABOVE_THRESHOLD') {
    const threshold = policyVersion.approvalThresholdMinor ?? 0;
    if (amountMinor > threshold) {
      requiresApproval = true;
      if (!reasonCodes.includes('HUMAN_APPROVAL_REQUIRED')) {
        reasonCodes.push('HUMAN_APPROVAL_REQUIRED');
      }
      checks.push({
        id: 'approval_condition',
        label: `Above ${formatUSD(threshold)} approval threshold`,
        status: 'warning',
        detail: `Amount ${formatUSD(amountMinor)} strictly exceeds threshold ${formatUSD(threshold)}`,
      });
    } else {
      checks.push({
        id: 'approval_condition',
        label: `At or below ${formatUSD(threshold)} threshold`,
        status: 'passed',
      });
    }
  }

  if (requiresApproval) {
    const thresholdStr = policyVersion.approvalThresholdMinor
      ? formatUSD(policyVersion.approvalThresholdMinor)
      : 'threshold';
    const explanation = isNewRecipientApproval
      ? `Payment is within limits, but recipient '${recipientEmail}' is new and requires human countersign.`
      : `Within the agent's spending limits, but above the ${thresholdStr} approval threshold.`;

    return {
      decision: 'PENDING_APPROVAL',
      reasonCodes,
      explanation,
      checks,
      policyId: policyVersion.policyId,
      policyVersion: policyVersion.version,
      evaluatedAt,
    };
  }

  // 11. Otherwise: AUTHORIZED
  return {
    decision: 'AUTHORIZED',
    reasonCodes: [],
    explanation: `Authorized automatically. Amount ${formatUSD(amountMinor)} satisfies all policy criteria.`,
    checks,
    policyId: policyVersion.policyId,
    policyVersion: policyVersion.version,
    evaluatedAt,
  };
}
