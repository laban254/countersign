import { runPolicyEngineTests } from './policy-engine.test.ts';
import { runLedgerTests } from './ledger.test.ts';
import { runMoneyTests } from './money.test.ts';
import { runSecurityTests } from './security.test.ts';

async function main() {
  console.log('====================================================');
  console.log('  COUNTERSIGN TEST SUITE — DOMAIN, SECURITY & CRYPTO ');
  console.log('====================================================\n');

  const policyRes = runPolicyEngineTests();
  console.log(`[Policy Engine] Passed: ${policyRes.passed}, Failed: ${policyRes.failed}`);
  if (policyRes.errors.length) console.error(policyRes.errors.join('\n'));

  const ledgerRes = runLedgerTests();
  console.log(`[Ledger Hash Chain] Passed: ${ledgerRes.passed}, Failed: ${ledgerRes.failed}`);
  if (ledgerRes.errors.length) console.error(ledgerRes.errors.join('\n'));

  const moneyRes = runMoneyTests();
  console.log(`[Money Precision] Passed: ${moneyRes.passed}, Failed: ${moneyRes.failed}`);
  if (moneyRes.errors.length) console.error(moneyRes.errors.join('\n'));

  const securityRes = await runSecurityTests();
  console.log(`[Auth, Policy & Store] Passed: ${securityRes.passed}, Failed: ${securityRes.failed}`);
  if (securityRes.errors.length) console.error(securityRes.errors.join('\n'));

  const totalPassed =
    policyRes.passed + ledgerRes.passed + moneyRes.passed + securityRes.passed;
  const totalFailed =
    policyRes.failed + ledgerRes.failed + moneyRes.failed + securityRes.failed;

  console.log('\n----------------------------------------------------');
  console.log(`SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('----------------------------------------------------');

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed cleanly.\n');
  }
}

main().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
