/**
 * Countersign Seed Script
 * Resets the in-memory or database store to the official Golden Demo state.
 *
 * Usage:
 *   npm run seed
 */
import '../src/server/env.ts';

const host = process.env.APP_BASE_URL || 'http://localhost:3000';

async function main() {
  console.log('Seeding Countersign workspace and golden demo data...');
  try {
    const res = await fetch(`${host}/api/v1/seed/reset`, { method: 'POST' });
    const data = await res.json();
    console.log('Seed response:', data.message);

    // Optionally seed golden demo transactions
    const demoRes = await fetch(`${host}/api/v1/seed/golden-demo`, { method: 'POST' });
    const demoData = await demoRes.json();
    console.log('Golden demo transactions:', demoData.message);

    console.log('\nSeeding completed successfully!');
    console.log('Workspace: Countersign Demo Co. (ws_demo_001)');
    console.log('Agent: operations-agent (agt_operations_001)');
    console.log('Policy: Operations Spending Policy v3 (Active)');
    console.log('  - Max per txn: $100.00 USD');
    console.log('  - Daily cap: $120.00 USD');
    console.log('  - Monthly cap: $300.00 USD');
    console.log('  - Countersign threshold: $40.00 USD');
    console.log('Recipient: Second Signature Cloud (vendor-sandbox@example.test)');
  } catch (err) {
    console.error('Failed to run seed script:', err);
    process.exit(1);
  }
}

main();

export {};
