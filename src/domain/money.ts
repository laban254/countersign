/**
 * Countersign Money utilities
 * All monetary amounts are handled internally as integer minor units (e.g. cents).
 * Floating-point representation is used exclusively at formatting boundaries.
 */

/**
 * Parse a user-supplied amount into integer minor units.
 * Returns null when the input is not a valid decimal amount, so callers can
 * reject malformed requests instead of silently treating them as zero.
 */
export function parseAmountMinor(amount: unknown): number | null {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) return null;
    return Math.round((amount + Number.EPSILON) * 100);
  }

  if (typeof amount !== 'string') return null;

  const trimmed = amount.trim();
  if (!trimmed) return null;

  // Strip currency symbols/commas but keep the decimal structure.
  const clean = trimmed.replace(/[^0-9.-]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return null;

  return decimalStringToMinor(clean);
}

export function toMinor(amount: string | number): number {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) return 0;
    return Math.round((amount + Number.EPSILON) * 100);
  }

  if (typeof amount !== 'string') return 0;

  const clean = amount.replace(/[^0-9.-]/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(clean)) return 0;

  return decimalStringToMinor(clean);
}

function decimalStringToMinor(clean: string): number {
  const match = clean.match(/^(-)?(\d+)(?:\.(\d+))?$/);
  if (!match) return 0;

  const sign = match[1] ? -1 : 1;
  const whole = Number.parseInt(match[2], 10);
  const fraction = (match[3] || '').padEnd(3, '0');

  let minor = whole * 100 + Number.parseInt(fraction.slice(0, 2), 10);
  // Round half up based on the third decimal digit.
  if (Number.parseInt(fraction[2] || '0', 10) >= 5) minor += 1;

  return sign * minor;
}

export function toMajor(minor: number): number {
  return minor / 100;
}

export function formatUSD(minor: number): string {
  return formatCurrency(minor, 'USD');
}

export function formatCurrency(minor: number, currency: string = 'USD'): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}
