import { toMinor, toMajor, formatUSD, formatCurrency, parseAmountMinor } from '../src/domain/money.ts';

export function runMoneyTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(name: string, condition: boolean, detail = '') {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`FAILED: ${name} ${detail}`);
    }
  }

  assert('toMinor("49.00") is 4900', toMinor('49.00') === 4900);
  assert('toMinor(49) is 4900', toMinor(49) === 4900);
  assert('toMinor("$180.50") is 18050', toMinor('$180.50') === 18050);
  assert('toMinor("1,234.56") is 123456', toMinor('1,234.56') === 123456);
  assert('toMinor("-5.00") is -500', toMinor('-5.00') === -500);
  assert('toMinor("1.005") rounds half up to 101', toMinor('1.005') === 101);
  assert('toMajor(4900) is 49.00', toMajor(4900) === 49);
  assert('formatUSD(4900) contains "$49.00"', formatUSD(4900).includes('49.00'));
  assert('formatCurrency(18000, "USD") contains "180.00"', formatCurrency(18000, 'USD').includes('180.00'));

  assert('parseAmountMinor("49.00") is 4900', parseAmountMinor('49.00') === 4900);
  assert('parseAmountMinor("$180.50") is 18050', parseAmountMinor('$180.50') === 18050);
  assert('parseAmountMinor("abc") is null', parseAmountMinor('abc') === null);
  assert('parseAmountMinor("1.2.3") is null', parseAmountMinor('1.2.3') === null);
  assert('parseAmountMinor(undefined) is null', parseAmountMinor(undefined) === null);
  assert('parseAmountMinor(0) is 0', parseAmountMinor(0) === 0);
  assert('parseAmountMinor(NaN) is null', parseAmountMinor(Number.NaN) === null);

  return { passed, failed, errors };
}
