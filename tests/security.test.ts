import { store } from '../src/server/store.ts';
import { payPalService } from '../src/server/paypal/client.ts';
import { collectApiKeys, answerAssistantQuestion } from '../src/server/ai/assistant.ts';
import {
  hashAgentSecret,
  verifyAgentToken,
  verifyAdminToken,
  isAdminAuthRequired,
  resolveDashboardRole,
  isDemoModeEnabled,
} from '../src/server/auth.ts';
import {
  validatePolicyVersionInput,
  PolicyVersionInput,
} from '../src/domain/policy/validate.ts';
import {
  IdempotencyConflictError,
  RevalidationError,
} from '../src/server/errors.ts';

const validPolicy: PolicyVersionInput = {
  maxTransactionMinor: 10000,
  dailyLimitMinor: 12000,
  monthlyLimitMinor: 30000,
  approvalMode: 'ABOVE_THRESHOLD',
  approvalThresholdMinor: 4000,
  allowNewRecipients: false,
  currencyAllowlist: ['USD'],
};

function reset() {
  // Tests assume the default seeded recipient regardless of the local .env.
  delete process.env.DEMO_RECIPIENT_EMAIL;
  store.seedInitialData();
}

export async function runSecurityTests(): Promise<{
  passed: number;
  failed: number;
  errors: string[];
}> {
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

  // --- Policy validation -------------------------------------------------
  {
    const missingThreshold = validatePolicyVersionInput({
      ...validPolicy,
      approvalThresholdMinor: undefined,
    });
    assert(
      'S1: ABOVE_THRESHOLD without a threshold is rejected',
      missingThreshold.ok === false
    );

    const nanThreshold = validatePolicyVersionInput({
      ...validPolicy,
      approvalThresholdMinor: Number.NaN,
    });
    assert('S2: NaN threshold is rejected', nanThreshold.ok === false);

    const negativeLimit = validatePolicyVersionInput({
      ...validPolicy,
      dailyLimitMinor: -1,
    });
    assert('S3: Negative limits are rejected', negativeLimit.ok === false);

    const valid = validatePolicyVersionInput(validPolicy);
    assert('S4: Valid policy input is accepted', valid.ok === true);
  }

  // --- Agent token verification -----------------------------------------
  {
    reset();
    const demoAgent = store.agents.get('agt_operations_001');
    assert('S5: Seed agent exists', Boolean(demoAgent));

    const good = verifyAgentToken(
      'Bearer cs_agt_operations_001_live_demo_secret_key_8849',
      store.agents.values()
    );
    assert('S6: Valid agent token authenticates', good?.id === 'agt_operations_001');

    const wrongSecret = verifyAgentToken(
      'Bearer cs_agt_operations_001_wrong_secret',
      store.agents.values()
    );
    assert('S7: Wrong agent secret is rejected', wrongSecret === null);

    const malformed = verifyAgentToken(
      'Bearer cs_not_a_real_token',
      store.agents.values()
    );
    assert('S8: Malformed token is rejected', malformed === null);

    const created = store.createAgent({
      name: 'auth-test-agent',
      description: 'token verification test',
    });
    const verified = verifyAgentToken(
      `Bearer ${created.rawTokenOnce}`,
      store.agents.values()
    );
    assert(
      'S9: Newly issued agent token authenticates',
      verified?.id === created.agent.id
    );
    assert(
      'S10: Token hash uses a pepper-aware HMAC',
      created.agent.id !== '' &&
        store.agents.get(created.agent.id)?.tokenHash ===
          hashAgentSecret(created.rawTokenOnce.split('_').slice(-1)[0])
    );
  }

  // --- Admin token -------------------------------------------------------
  {
    const previous = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = 'test-admin-token';
    try {
      assert('S11: Admin auth is required when configured', isAdminAuthRequired());
      assert('S12: Correct admin token is accepted', verifyAdminToken('test-admin-token'));
      assert(
        'S13: Wrong admin token is rejected',
        verifyAdminToken('wrong-token') === false
      );
      assert('S14: Missing admin token is rejected', verifyAdminToken(undefined) === false);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = previous;
    }
  }

  // --- Idempotency -------------------------------------------------------
  {
    reset();
    const base = {
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      currency: 'USD',
      description: 'idempotency test',
      invoiceReference: 'INV-IDEMP-1',
      idempotencyKey: 'same-key',
    };

    const first = await store.submitPaymentIntent({ ...base, amountMinor: 3000 });
    const replay = await store.submitPaymentIntent({ ...base, amountMinor: 3000 });
    assert('S15: Identical replay is detected', replay.isIdempotentReplay === true);
    assert('S16: Replay returns the original intent', replay.intent.id === first.intent.id);

    let conflict = false;
    try {
      await store.submitPaymentIntent({ ...base, amountMinor: 4000 });
    } catch (err) {
      conflict = err instanceof IdempotencyConflictError;
    }
    assert('S17: Different payload for the same key is a conflict', conflict);
  }

  // --- Immutable policy snapshot ----------------------------------------
  {
    reset();
    const pending = await store.submitPaymentIntent({
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      amountMinor: 4900,
      currency: 'USD',
      description: 'snapshot test',
      invoiceReference: 'INV-SNAP-1',
      idempotencyKey: 'snapshot-key',
    });

    const newVersion = store.createPolicyVersion('pol_demo_001', {
      ...validPolicy,
      maxTransactionMinor: 20000,
      dailyLimitMinor: 30000,
      monthlyLimitMinor: 50000,
      changeNote: 'snapshot immutability test',
    });
    store.activatePolicyVersion('pol_demo_001', newVersion.id);

    assert(
      'S18: Snapshot status does not mutate when the live version is archived',
      pending.intent.policySnapshot.status === 'ACTIVE'
    );
    assert(
      'S19: Snapshot limits are unchanged',
      pending.intent.policySnapshot.maxTransactionMinor === 10000
    );
    assert(
      'S20: Live policy version changes',
      store.agents.get('agt_operations_001')?.activePolicyVersionId === newVersion.id
    );
  }

  // --- Approval revalidation --------------------------------------------
  {
    reset();
    const pending = await store.submitPaymentIntent({
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      amountMinor: 4900,
      currency: 'USD',
      description: 'revalidation test',
      invoiceReference: 'INV-REVAL-1',
      idempotencyKey: 'revalidation-key',
    });

    store.setAgentStatus('agt_operations_001', 'REVOKED');

    let revalidationFailed = false;
    try {
      await store.approvePaymentIntent(pending.intent.id, 'reviewer');
    } catch (err) {
      revalidationFailed = err instanceof RevalidationError;
    }

    assert('S21: Approval fails when the agent is revoked', revalidationFailed);
    assert('S22: Intent is marked denied', pending.intent.status === 'DENIED');
    assert(
      'S23: Reservation is released',
      pending.intent.reservation?.status === 'RELEASED'
    );
    assert(
      'S24: Reason code records the revocation',
      pending.intent.reasonCodes.includes('AGENT_REVOKED')
    );
  }

  // --- Expiry sweeper ----------------------------------------------------
  {
    reset();
    const pending = await store.submitPaymentIntent({
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      amountMinor: 4900,
      currency: 'USD',
      description: 'expiry test',
      invoiceReference: 'INV-EXP-1',
      idempotencyKey: 'expiry-key',
    });

    const past = new Date(Date.now() - 1000).toISOString();
    pending.intent.reservation!.expiresAt = past;
    pending.intent.approval!.expiresAt = past;

    const spending = store.getSpendingSummary();
    assert('S25: Expired intent is marked EXPIRED', pending.intent.status === 'EXPIRED');
    assert(
      'S26: Expired reservation is released',
      pending.intent.reservation?.status === 'EXPIRED'
    );
    assert('S27: Expired budget is no longer reserved', spending.dailyReservedMinor === 0);
  }

  // --- Webhook reconciliation -------------------------------------------
  {
    reset();
    const pending = await store.submitPaymentIntent({
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      amountMinor: 4900,
      currency: 'USD',
      description: 'webhook test',
      invoiceReference: 'INV-HOOK-1',
      idempotencyKey: 'webhook-key',
    });

    await store.approvePaymentIntent(pending.intent.id, 'reviewer');
    // Force the intent back into an in-flight state to model a non-terminal
    // provider response, then let the webhook settle it.
    pending.intent.status = 'PENDING';
    pending.intent.reservation!.status = 'HELD';
    pending.intent.payout!.payoutBatchId = 'B-TEST-1';
    pending.intent.payout!.payoutItemId = 'I-TEST-1';

    const first = store.processPayPalWebhook(
      {
        id: 'evt_test_1',
        event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
        resource: {
          payout_batch_id: 'B-TEST-1',
          payout_item_id: 'I-TEST-1',
          transaction_id: 'T-TEST-1',
        },
      },
      true
    );
    assert('S28: Webhook is processed', first.processed === true);
    const statusAfterWebhook = pending.intent.status as string;
    const reservationAfterWebhook = pending.intent.reservation?.status as
      | string
      | undefined;
    assert('S29: Webhook settles the intent', statusAfterWebhook === 'SUCCEEDED');
    assert(
      'S30: Webhook settles the reservation',
      reservationAfterWebhook === 'SETTLED'
    );

    const duplicate = store.processPayPalWebhook(
      {
        id: 'evt_test_1',
        event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
        resource: { payout_batch_id: 'B-TEST-1' },
      },
      true
    );
    assert('S31: Duplicate webhook is idempotent', duplicate.duplicate === true);
  }

  // --- Batch-level success webhook ---------------------------------------
  {
    reset();
    const created = await store.submitPaymentIntent({
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      amountMinor: 4900,
      currency: 'USD',
      description: 'batch webhook test',
      invoiceReference: 'INV-BATCH-1',
      idempotencyKey: 'batch-hook-key',
    });
    await store.approvePaymentIntent(created.intent.id, 'reviewer');
    created.intent.status = 'PENDING';
    created.intent.reservation!.status = 'HELD';
    created.intent.payout!.payoutBatchId = 'B-BATCH-1';
    const result = store.processPayPalWebhook(
      {
        id: 'evt_batch_1',
        event_type: 'PAYMENT.PAYOUTSBATCH.SUCCESS',
        resource: { batch_header: { payout_batch_id: 'B-BATCH-1' } },
      },
      true
    );
    assert(
      'W1: Batch SUCCESS webhook settles the payout',
      result.processed === true && (created.intent.status as string) === 'SUCCEEDED'
    );
  }

  // --- Assistant what-if uses the real approved vendor -------------------
  {
    delete process.env.DEMO_RECIPIENT_EMAIL;
    process.env.DEMO_RECIPIENT_EMAIL = 'receiver@personal.example.com';
    store.seedInitialData();
    try {
      await store.submitPaymentIntent({
        agentId: 'agt_operations_001',
        recipientName: 'Second Signature Cloud',
        recipientEmail: 'receiver@personal.example.com',
        amountMinor: 4900,
        currency: 'USD',
        description: 'what-if test',
        invoiceReference: 'INV-WHATIF-1',
        idempotencyKey: 'whatif-key',
      });
      const answer = await answerAssistantQuestion('What if this agent requested $80 right now?');
      const codes = answer.simulationResult?.reasonCodes ?? [];
      assert('A1: What-if $80 is denied for the daily cap', codes.includes('DAILY_LIMIT_EXCEEDED'), codes.join(','));
      assert('A2: What-if is not denied for a placeholder recipient', !codes.includes('RECIPIENT_NOT_APPROVED'), codes.join(','));
    } finally {
      delete process.env.DEMO_RECIPIENT_EMAIL;
    }
  }

  // --- Gemini key list ---------------------------------------------------
  {
    assert('K1: No keys configured gives an empty list', collectApiKeys({} as NodeJS.ProcessEnv).length === 0);
    const keys = collectApiKeys({
      GEMINI_API_KEY: ' primary ',
      GEMINI_API_KEY_2: 'secondary',
      GEMINI_API_KEYS: 'secondary, third ,',
    } as unknown as NodeJS.ProcessEnv);
    assert('K2: Primary key comes first, whitespace trimmed', keys[0] === 'primary');
    assert('K3: Duplicates are removed and order kept', keys.join('|') === 'primary|secondary|third', keys.join('|'));
  }

  // --- Dashboard roles (admin vs public judge token) ---------------------
  {
    const savedAdmin = process.env.ADMIN_TOKEN;
    const savedDemo = process.env.DEMO_PUBLIC_TOKEN;
    try {
      process.env.ADMIN_TOKEN = 'admin-token-for-tests-1234';
      delete process.env.DEMO_PUBLIC_TOKEN;
      assert('D1: Demo mode is off without DEMO_PUBLIC_TOKEN', isDemoModeEnabled() === false);
      assert('D2: Admin token resolves to admin', resolveDashboardRole('Bearer admin-token-for-tests-1234') === 'admin');
      assert('D3: Unknown token is rejected', resolveDashboardRole('Bearer nope') === null);

      process.env.DEMO_PUBLIC_TOKEN = 'judge-token-for-tests-5678';
      assert('D4: Demo mode turns on with DEMO_PUBLIC_TOKEN', isDemoModeEnabled() === true);
      assert('D5: Judge token resolves to judge', resolveDashboardRole('Bearer judge-token-for-tests-5678') === 'judge');
      assert('D6: Admin token still resolves to admin', resolveDashboardRole('Bearer admin-token-for-tests-1234') === 'admin');

      process.env.DEMO_PUBLIC_TOKEN = 'short';
      assert('D7: Too-short demo token is ignored', isDemoModeEnabled() === false);

      process.env.DEMO_PUBLIC_TOKEN = 'judge-token-for-tests-5678';
      delete process.env.ADMIN_TOKEN;
      assert('D8: Demo mode requires ADMIN_TOKEN to be set', isDemoModeEnabled() === false);
    } finally {
      if (savedAdmin === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = savedAdmin;
      if (savedDemo === undefined) delete process.env.DEMO_PUBLIC_TOKEN;
      else process.env.DEMO_PUBLIC_TOKEN = savedDemo;
    }
  }

  // --- Reconciliation polling -------------------------------------------
  {
    const originalFetch = payPalService.fetchPayoutStatus;
    const makePending = async (key: string) => {
      reset();
      const created = await store.submitPaymentIntent({
        agentId: 'agt_operations_001',
        recipientName: 'Second Signature Cloud',
        recipientEmail: 'vendor-sandbox@example.test',
        amountMinor: 4900,
        currency: 'USD',
        description: 'reconcile test',
        invoiceReference: `INV-${key}`,
        idempotencyKey: key,
      });
      await store.approvePaymentIntent(created.intent.id, 'reviewer');
      created.intent.status = 'PENDING';
      created.intent.reservation!.status = 'HELD';
      created.intent.payout!.payoutBatchId = `B-${key}`;
      return created.intent;
    };

    try {
      const stillOpen = await makePending('recon-open');
      payPalService.fetchPayoutStatus = async () => ({
        batchStatus: 'PROCESSING',
        itemStatus: 'PENDING',
        payoutItemId: 'I-1',
        transactionId: '',
      });
      await store.reconcilePayout(stillOpen.id);
      assert(
        'R1: Reconcile keeps a still-pending payout reserved',
        (stillOpen.status as string) === 'PENDING' &&
          (stillOpen.reservation?.status as string) === 'HELD'
      );

      payPalService.fetchPayoutStatus = async () => ({
        batchStatus: 'SUCCESS',
        itemStatus: 'SUCCESS',
        payoutItemId: 'I-2',
        transactionId: 'T-2',
      });
      await store.reconcilePayout(stillOpen.id);
      assert(
        'R2: Reconcile settles a successful payout',
        (stillOpen.status as string) === 'SUCCEEDED' &&
          (stillOpen.reservation?.status as string) === 'SETTLED' &&
          stillOpen.payout?.transactionId === 'T-2'
      );
      const settledEvents = store.ledgerEvents.filter(
        (e) => e.paymentIntentId === stillOpen.id && e.eventType === 'PAYOUT_SUCCEEDED'
      );
      assert(
        'R3: Reconcile writes an auditable ledger event',
        settledEvents.some((e) => e.actorId === 'paypal-reconciliation')
      );

      const failing = await makePending('recon-fail');
      payPalService.fetchPayoutStatus = async () => ({
        batchStatus: 'DENIED',
        itemStatus: 'FAILED',
        payoutItemId: 'I-3',
        transactionId: '',
      });
      await store.reconcilePayout(failing.id);
      assert(
        'R4: Reconcile releases budget for a failed payout',
        (failing.status as string) === 'FAILED' &&
          store.getSpendingSummary().dailyReservedMinor === 0
      );

      const callsBefore = store.ledgerEvents.length;
      await store.reconcilePayout(failing.id);
      assert(
        'R5: Reconcile is a no-op for a terminal payout',
        store.ledgerEvents.length === callsBefore
      );
    } finally {
      payPalService.fetchPayoutStatus = originalFetch;
    }
  }

  // --- Durable snapshot round-trip --------------------------------------
  {
    reset();
    const pending = await store.submitPaymentIntent({
      agentId: 'agt_operations_001',
      recipientName: 'Second Signature Cloud',
      recipientEmail: 'vendor-sandbox@example.test',
      amountMinor: 4900,
      currency: 'USD',
      description: 'snapshot persistence test',
      invoiceReference: 'INV-PERSIST-1',
      idempotencyKey: 'persist-key',
    });
    await store.approvePaymentIntent(pending.intent.id, 'reviewer');

    const snapshot = store.toSnapshot();
    const headBefore = store.verifyChain().headHash;

    store.seedInitialData();
    store.hydrate(snapshot);

    const restored = store.paymentIntents.get(pending.intent.id);
    const verification = store.verifyChain();

    assert('S34: Hydration restores intents', Boolean(restored));
    assert(
      'S35: Hydration restores approval linkage',
      restored?.approval?.decision === 'APPROVED'
    );
    assert(
      'S36: Hydration restores reservation linkage',
      restored?.reservation?.status === 'SETTLED'
    );
    assert('S37: Hydrated ledger still verifies', verification.valid === true);
    assert('S38: Hydrated head hash is unchanged', verification.headHash === headBefore);
    assert(
      'S39: Hydrated policy versions re-link',
      (store.policies.get('pol_demo_001')?.versions.length ?? 0) >= 3
    );
  }

  // --- Concurrency / budget reservation ---------------------------------
  {
    reset();
    const requests = Array.from({ length: 10 }, (_, index) =>
      store.submitPaymentIntent({
        agentId: 'agt_operations_001',
        recipientName: 'Second Signature Cloud',
        recipientEmail: 'vendor-sandbox@example.test',
        amountMinor: 2000,
        currency: 'USD',
        description: `concurrency ${index}`,
        invoiceReference: `INV-CONC-${index}`,
        idempotencyKey: `concurrency-${index}`,
      })
    );

    const results = await Promise.all(requests);
    const authorized = results.filter(
      (result) => result.intent.decision === 'AUTHORIZED'
    ).length;
    const denied = results.filter((result) => result.intent.decision === 'DENIED').length;

    assert(
      'S32: Exactly six $20 requests fit the $120 daily budget',
      authorized === 6,
      `authorized=${authorized}`
    );
    assert('S33: Remaining requests are denied', denied === 4, `denied=${denied}`);
  }

  return { passed, failed, errors };
}
