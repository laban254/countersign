import { ApprovalMode } from '../types.ts';

export interface PolicyVersionInput {
  maxTransactionMinor: unknown;
  dailyLimitMinor: unknown;
  monthlyLimitMinor: unknown;
  approvalMode: unknown;
  approvalThresholdMinor?: unknown;
  allowNewRecipients?: unknown;
  currencyAllowlist?: unknown;
  changeNote?: unknown;
}

export interface ValidatedPolicyVersionInput {
  maxTransactionMinor: number;
  dailyLimitMinor: number;
  monthlyLimitMinor: number;
  approvalMode: ApprovalMode;
  approvalThresholdMinor: number | null;
  allowNewRecipients: boolean;
  currencyAllowlist: string[];
  changeNote?: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function parseInteger(value: unknown, name: string, errors: string[]): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    errors.push(`${name} must be a non-negative integer in minor units`);
    return Number.NaN;
  }
  return n;
}

/**
 * Validate and normalize a policy version before it can be persisted.
 *
 * This deliberately rejects an omitted threshold for ABOVE_THRESHOLD instead
 * of coercing it to NaN. `amountMinor > NaN` is always false, which would
 * silently authorize every payment.
 */
export function validatePolicyVersionInput(
  input: PolicyVersionInput
): ValidationResult<ValidatedPolicyVersionInput> {
  const errors: string[] = [];

  const maxTransactionMinor = parseInteger(
    input.maxTransactionMinor,
    'maxTransactionMinor',
    errors
  );
  const dailyLimitMinor = parseInteger(input.dailyLimitMinor, 'dailyLimitMinor', errors);
  const monthlyLimitMinor = parseInteger(
    input.monthlyLimitMinor,
    'monthlyLimitMinor',
    errors
  );

  const approvalMode = input.approvalMode;
  if (approvalMode !== 'NEVER' && approvalMode !== 'ABOVE_THRESHOLD' && approvalMode !== 'ALWAYS') {
    errors.push('approvalMode must be one of NEVER, ABOVE_THRESHOLD, ALWAYS');
  }

  let approvalThresholdMinor: number | null = null;
  if (approvalMode === 'ABOVE_THRESHOLD') {
    if (
      input.approvalThresholdMinor === undefined ||
      input.approvalThresholdMinor === null ||
      input.approvalThresholdMinor === ''
    ) {
      errors.push('approvalThresholdMinor is required when approvalMode is ABOVE_THRESHOLD');
    } else {
      approvalThresholdMinor = parseInteger(
        input.approvalThresholdMinor,
        'approvalThresholdMinor',
        errors
      );
    }
  }

  if (
    Number.isFinite(maxTransactionMinor) &&
    Number.isFinite(dailyLimitMinor) &&
    maxTransactionMinor > dailyLimitMinor
  ) {
    errors.push('maxTransactionMinor must not exceed dailyLimitMinor');
  }

  if (
    Number.isFinite(dailyLimitMinor) &&
    Number.isFinite(monthlyLimitMinor) &&
    dailyLimitMinor > monthlyLimitMinor
  ) {
    errors.push('dailyLimitMinor must not exceed monthlyLimitMinor');
  }

  if (
    Number.isFinite(approvalThresholdMinor as number) &&
    Number.isFinite(maxTransactionMinor) &&
    (approvalThresholdMinor as number) > maxTransactionMinor
  ) {
    errors.push('approvalThresholdMinor must not exceed maxTransactionMinor');
  }

  const allowNewRecipients =
    input.allowNewRecipients === true || input.allowNewRecipients === 'true';

  let currencyAllowlist: string[] = ['USD'];
  if (input.currencyAllowlist !== undefined) {
    if (!Array.isArray(input.currencyAllowlist) || input.currencyAllowlist.length === 0) {
      errors.push('currencyAllowlist must be a non-empty array');
    } else {
      currencyAllowlist = input.currencyAllowlist.map((currency) =>
        String(currency).trim().toUpperCase()
      );
      if (currencyAllowlist.some((currency) => !/^[A-Z]{3}$/.test(currency))) {
        errors.push('currencyAllowlist entries must be three-letter ISO currency codes');
      }
    }
  }

  let changeNote: string | undefined;
  if (input.changeNote !== undefined && input.changeNote !== null) {
    if (typeof input.changeNote !== 'string') {
      errors.push('changeNote must be a string');
    } else {
      changeNote = input.changeNote.trim().slice(0, 500);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      maxTransactionMinor,
      dailyLimitMinor,
      monthlyLimitMinor,
      approvalMode: approvalMode as ApprovalMode,
      approvalThresholdMinor,
      allowNewRecipients,
      currencyAllowlist,
      changeNote,
    },
  };
}
