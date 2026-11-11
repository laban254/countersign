import './src/server/env.ts';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { store, toPublicAgent } from './src/server/store.ts';
import {
  draftPolicyFromNL,
  answerAssistantQuestion,
  simulatePolicy,
} from './src/server/ai/assistant.ts';
import { parseAmountMinor } from './src/domain/money.ts';
import { AppError } from './src/server/errors.ts';
import {
  assertProductionAuthConfig,
  getDemoPublicToken,
  isAdminAuthRequired,
  isDemoModeEnabled,
  resolveDashboardRole,
  verifyAgentToken,
} from './src/server/auth.ts';
import { assertLedgerSecretConfig } from './src/server/ledger.ts';
import { payPalService } from './src/server/paypal/client.ts';
import { Agent } from './src/domain/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type AuthedRequest = Request & { agent: Agent };
type RawBodyRequest = Request & { rawBody?: Buffer };

const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function getAuthedAgent(req: Request): Agent {
  return (req as unknown as AuthedRequest).agent;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();

    if (rateBuckets.size > 10_000) {
      for (const [bucketKey, entry] of rateBuckets) {
        if (entry.resetAt <= now) rateBuckets.delete(bucketKey);
      }
    }

    const bucket = rateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= max) {
      res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
      return;
    }

    bucket.count += 1;
    next();
  };
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isAdminAuthRequired()) {
    next();
    return;
  }

  const header =
    firstHeader(req.headers.authorization) ||
    firstHeader(req.headers['x-admin-token'] as string | string[] | undefined);

  const role = resolveDashboardRole(header);
  if (!role) {
    res.status(401).json({
      error: 'Admin authentication required',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  // Judges may explore everything except actions that would break the shared demo for
  // the next visitor: rotating or pausing/revoking the demo agent.
  if (role === 'judge') {
    const restricted =
      req.method !== 'GET' &&
      (/^\/agents\/[^/]+\/rotate-token$/.test(req.path) ||
        /^\/agents\/[^/]+\/status$/.test(req.path));
    if (restricted) {
      res.status(403).json({
        error: 'Not available in the public demo',
        code: 'DEMO_RESTRICTED',
      });
      return;
    }
  }

  next();
}

function requireAgent(req: Request, res: Response, next: NextFunction): void {
  const agent = verifyAgentToken(req.headers.authorization, store.agents.values());
  if (!agent) {
    res.status(401).json({
      error: 'Invalid or missing agent bearer token',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  (req as unknown as AuthedRequest).agent = agent;
  next();
}

async function startServer() {
  assertProductionAuthConfig();
  assertLedgerSecretConfig();
  await store.initialize();

  const app = express();
  app.set('trust proxy', 1);
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '0.0.0.0';

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  app.use(
    cors(
      corsOrigin
        ? {
            origin: corsOrigin
              .split(',')
              .map((origin) => origin.trim())
              .filter(Boolean),
          }
        : {}
    )
  );
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = Buffer.from(buf);
      },
    })
  );

  // Public API description, importable by SDK/doc generators such as APIMatic.
  app.get('/openapi.yaml', (_req, res) => {
    res.type('application/yaml').sendFile(path.resolve(__dirname, 'openapi.yaml'));
  });

  // -------------------------------------------------------------
  // AUTH GATES
  // Public: health, auth status/verify, agent routes (agent token), webhooks.
  // Everything else under /api/v1 requires the admin token when configured.
  // -------------------------------------------------------------
  app.use('/api/v1', (req, res, next) => {
    const pathName = req.path;
    if (
      pathName === '/health' ||
      pathName.startsWith('/auth') ||
      pathName === '/agent' ||
      pathName.startsWith('/agent/') ||
      pathName === '/webhooks/paypal'
    ) {
      next();
      return;
    }
    requireAdmin(req, res, next);
  });

  app.use('/api/v1/agent', requireAgent);

  // -------------------------------------------------------------
  // PUBLIC / AUTH ROUTES
  // -------------------------------------------------------------

  app.get('/api/v1/health', (_req, res) => {
    const verification = store.verifyChain();
    res.json({
      status: 'ok',
      service: 'Countersign Financial Control Plane',
      timestamp: new Date().toISOString(),
      ledgerChainValid: verification.valid,
      ledgerHeadHash: verification.headHash,
      authRequired: isAdminAuthRequired(),
    });
  });

  app.get('/api/v1/auth/status', (_req, res) => {
    res.json({ authRequired: isAdminAuthRequired(), demoMode: isDemoModeEnabled() });
  });

  // Public demo access: only returns credentials when the operator has enabled demo mode
  // by setting DEMO_PUBLIC_TOKEN. Unset it (and restart) to switch this off.
  app.get('/api/v1/auth/demo', rateLimit(30, 60_000), (_req, res) => {
    const token = getDemoPublicToken();
    if (!isDemoModeEnabled() || !token) {
      res.json({ enabled: false });
      return;
    }
    const demoAgent = store.getDemoAgent();
    const secret = process.env.DEMO_AGENT_SECRET || 'live_demo_secret_key_8849';
    res.json({
      enabled: true,
      token,
      agentToken: demoAgent ? `${demoAgent.tokenPrefix}_${secret}` : null,
    });
  });

  app.post('/api/v1/auth/verify', rateLimit(10, 60_000), (req, res) => {
    if (!isAdminAuthRequired()) {
      res.json({ ok: true, authRequired: false });
      return;
    }

    const token = req.body?.token ?? firstHeader(req.headers.authorization);
    const role = resolveDashboardRole(token);
    if (!role) {
      res.status(401).json({ error: 'Invalid admin token', code: 'UNAUTHORIZED' });
      return;
    }

    res.json({ ok: true, authRequired: true, role });
  });

  // --- AGENT API ---

  app.post(
    '/api/v1/agent/payment-intents',
    rateLimit(120, 60_000),
    asyncHandler(async (req, res) => {
      const agent = getAuthedAgent(req);
      const body = req.body ?? {};

      const idempotencyKey =
        firstHeader(
          req.headers['idempotency-key'] as string | string[] | undefined
        ) ||
        (typeof body.idempotency_key === 'string' ? body.idempotency_key : undefined);

      const recipient =
        body.recipient && typeof body.recipient === 'object' ? body.recipient : {};
      const recipientEmail = String(
        recipient.email || body.recipient_email || ''
      ).trim();
      const recipientName = String(
        recipient.name || body.recipient_name || ''
      ).trim();

      const amountNode = body.amount;
      const amountValue =
        amountNode && typeof amountNode === 'object' ? amountNode.value : amountNode;
      const rawAmount = amountValue !== undefined ? amountValue : body.amount_value;
      const amountMinor = parseAmountMinor(rawAmount);

      if (amountMinor === null) {
        res.status(400).json({
          error: 'amount must be a valid decimal amount',
          code: 'INVALID_REQUEST',
        });
        return;
      }

      const currency = String(
        (amountNode && typeof amountNode === 'object'
          ? amountNode.currency
          : undefined) ||
          body.currency ||
          'USD'
      );

      const result = await store.submitPaymentIntent({
        agentId: agent.id,
        recipientName: recipientName || recipientEmail,
        recipientEmail,
        amountMinor,
        currency,
        description: String(body.description || 'Agent Payment Intent'),
        invoiceReference: String(body.invoice_reference || ''),
        metadata:
          body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
        idempotencyKey,
      });

      if (result.isIdempotentReplay) {
        res.setHeader('Idempotent-Replay', 'true');
      }

      const status = result.isIdempotentReplay
        ? 200
        : result.intent.decision === 'DENIED'
          ? 422
          : 201;

      res.status(status).json(result.intent);
    })
  );

  app.get('/api/v1/agent/payment-intents', (req, res) => {
    const agent = getAuthedAgent(req);
    const statusFilter =
      typeof req.query.status === 'string' ? req.query.status : undefined;

    let intents = Array.from(store.paymentIntents.values()).filter(
      (intent) => intent.agentId === agent.id
    );
    if (statusFilter) {
      intents = intents.filter((intent) => intent.status === statusFilter);
    }

    res.json([...intents].reverse());
  });

  app.get('/api/v1/agent/payment-intents/:id', (req, res) => {
    const agent = getAuthedAgent(req);
    const intent = store.paymentIntents.get(req.params.id);
    if (!intent || intent.agentId !== agent.id) {
      res.status(404).json({ error: 'Payment intent not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(intent);
  });

  app.get('/api/v1/agent/me', (req, res) => {
    const agent = getAuthedAgent(req);
    res.json(toPublicAgent(agent));
  });

  // --- DASHBOARD API ---

  app.get('/api/v1/overview', (_req, res) => {
    const spending = store.getSpendingSummary();
    const intents = Array.from(store.paymentIntents.values());
    const pendingApprovals = intents.filter(
      (intent) => intent.status === 'PENDING_APPROVAL'
    );
    const recentIntents = [...intents].reverse().slice(0, 8);
    const agents = store.getPublicAgents();
    const policies = Array.from(store.policies.values());
    const chainVerification = store.verifyChain();

    res.json({
      workspace: store.workspace,
      spending,
      stats: {
        totalIntents: intents.length,
        pendingApprovalsCount: pendingApprovals.length,
        activeAgentsCount: agents.filter((agent) => agent.status === 'ACTIVE').length,
        approvedRecipientsCount: Array.from(store.recipients.values()).filter(
          (recipient) => recipient.status === 'APPROVED'
        ).length,
        ledgerEventsCount: store.ledgerEvents.length,
        chainIntegrity: chainVerification.valid,
      },
      pendingApprovals,
      recentIntents,
      agents,
      policies,
    });
  });

  // Agents
  app.get('/api/v1/agents', (_req, res) => {
    res.json(store.getPublicAgents());
  });

  app.post('/api/v1/agents', (req, res) => {
    const { name, description, activePolicyVersionId } = req.body ?? {};
    const result = store.createAgent({
      name,
      description,
      activePolicyVersionId,
    });
    res.status(201).json(result);
  });

  app.patch('/api/v1/agents/:id/status', (req, res) => {
    const agent = store.setAgentStatus(req.params.id, req.body?.status);
    res.json(toPublicAgent(agent));
  });

  app.post('/api/v1/agents/:id/rotate-token', (req, res) => {
    const result = store.rotateAgentToken(req.params.id);
    res.json({
      ...result,
      message: 'Token rotated. Store this token now as it cannot be shown again.',
    });
  });

  // Policies
  app.get('/api/v1/policies', (_req, res) => {
    const policies = Array.from(store.policies.values()).map((policy) => {
      const versions = Array.from(store.policyVersions.values()).filter(
        (version) => version.policyId === policy.id
      );
      return { ...policy, versions };
    });
    res.json(policies);
  });

  app.post('/api/v1/policies/:id/versions', (req, res) => {
    const newVersion = store.createPolicyVersion(req.params.id, req.body ?? {});
    res.status(201).json(newVersion);
  });

  app.post(
    '/api/v1/policies/:id/versions/:versionId/activate',
    (req, res) => {
      const result = store.activatePolicyVersion(
        req.params.id,
        req.params.versionId
      );
      res.json({
        policy: result.policy,
        activatedVersion: result.activatedVersion,
      });
    }
  );

  // Recipients
  app.get('/api/v1/recipients', (_req, res) => {
    res.json(Array.from(store.recipients.values()));
  });

  app.post('/api/v1/recipients', (req, res) => {
    const { displayName, email, status } = req.body ?? {};
    const recipient = store.createRecipient({ displayName, email, status });
    res.status(201).json(recipient);
  });

  app.patch('/api/v1/recipients/:id', (req, res) => {
    const recipient = store.setRecipientStatus(req.params.id, req.body?.status);
    res.json(recipient);
  });

  // Payment Intents
  app.get('/api/v1/payment-intents', (req, res) => {
    const statusFilter =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    let intents = Array.from(store.paymentIntents.values());
    if (statusFilter) {
      intents = intents.filter((intent) => intent.status === statusFilter);
    }
    res.json([...intents].reverse());
  });

  app.get('/api/v1/payment-intents/:id', (req, res) => {
    const intent = store.paymentIntents.get(req.params.id);
    if (!intent) {
      res.status(404).json({ error: 'Payment intent not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(intent);
  });

  app.post(
    '/api/v1/payment-intents/:id/approve',
    rateLimit(30, 60_000),
    asyncHandler(async (req, res) => {
      const comment =
        typeof req.body?.comment === 'string'
          ? req.body.comment.slice(0, 500)
          : undefined;
      const approved = await store.approvePaymentIntent(
        String(req.params.id),
        store.user.name,
        comment
      );
      res.json(approved);
    })
  );

  app.post(
    '/api/v1/payment-intents/:id/reject',
    rateLimit(30, 60_000),
    asyncHandler(async (req, res) => {
      const comment =
        typeof req.body?.comment === 'string'
          ? req.body.comment.slice(0, 500)
          : undefined;
      const rejected = await store.rejectPaymentIntent(
        String(req.params.id),
        store.user.name,
        comment
      );
      res.json(rejected);
    })
  );

  app.post(
    '/api/v1/payment-intents/:id/reconcile',
    rateLimit(30, 60_000),
    asyncHandler(async (req, res) => {
      const intent = await store.reconcilePayout(String(req.params.id));
      await store.flushPersistence();
      res.json(intent);
    })
  );

  // Audit Ledger
  app.get('/api/v1/ledger/events', (req, res) => {
    const intentId =
      typeof req.query.payment_intent_id === 'string'
        ? req.query.payment_intent_id
        : undefined;
    let events = store.ledgerEvents;
    if (intentId) {
      events = events.filter((event) => event.paymentIntentId === intentId);
    }
    res.json(events);
  });

  app.get('/api/v1/ledger/verify', (_req, res) => {
    res.json(store.verifyChain());
  });

  // Spending Analytics
  app.get('/api/v1/analytics/spending', (req, res) => {
    const agentId =
      typeof req.query.agent_id === 'string' ? req.query.agent_id : undefined;
    res.json(store.getSpendingSummary(agentId));
  });

  // AI Assistant Endpoints
  app.post(
    '/api/v1/ai/policy-draft',
    rateLimit(10, 60_000),
    asyncHandler(async (req, res) => {
      const prompt = req.body?.prompt;
      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Prompt text is required', code: 'INVALID_REQUEST' });
        return;
      }
      if (prompt.length > 2_000) {
        res.status(400).json({ error: 'Prompt is too long', code: 'INVALID_REQUEST' });
        return;
      }
      const proposal = await draftPolicyFromNL(prompt);
      res.json(proposal);
    })
  );

  app.post(
    '/api/v1/ai/assistant',
    rateLimit(20, 60_000),
    asyncHandler(async (req, res) => {
      const question = req.body?.question;
      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Question is required', code: 'INVALID_REQUEST' });
        return;
      }
      if (question.length > 2_000) {
        res.status(400).json({ error: 'Question is too long', code: 'INVALID_REQUEST' });
        return;
      }
      const answerData = await answerAssistantQuestion(question);
      res.json(answerData);
    })
  );

  app.post('/api/v1/ai/simulate', rateLimit(30, 60_000), (req, res) => {
    const { amountMinor, recipientEmail, currency, agentId } = req.body ?? {};
    const parsedAmount = Number(amountMinor);
    if (!Number.isInteger(parsedAmount)) {
      res.status(400).json({
        error: 'amountMinor must be an integer',
        code: 'INVALID_REQUEST',
      });
      return;
    }

    const evaluation = simulatePolicy({
      amountMinor: parsedAmount,
      recipientEmail: String(
        recipientEmail || store.getDemoRecipient()?.email || 'vendor-sandbox@example.test'
      ),
      currency: String(currency || 'USD'),
      agentId: typeof agentId === 'string' ? agentId : undefined,
    });
    res.json(evaluation);
  });

  // PayPal Webhooks
  app.post(
    '/api/v1/webhooks/paypal',
    asyncHandler(async (req, res) => {
      const event = req.body;
      if (
        !event ||
        typeof event !== 'object' ||
        typeof event.id !== 'string' ||
        typeof event.event_type !== 'string'
      ) {
        res.status(400).json({
          error: 'Webhook event must include id and event_type',
          code: 'INVALID_REQUEST',
        });
        return;
      }

      const webhookId = process.env.PAYPAL_WEBHOOK_ID || '';
      let verified = false;

      if (webhookId && payPalService.isConfigured) {
        const header = (name: string) =>
          firstHeader(req.headers[name] as string | string[] | undefined) || '';

        verified = await payPalService.verifyWebhookSignature({
          transmissionId: header('paypal-transmission-id'),
          transmissionTime: header('paypal-transmission-time'),
          certUrl: header('paypal-cert-url'),
          authAlgo: header('paypal-auth-algo'),
          transmissionSig: header('paypal-transmission-sig'),
          webhookId,
          webhookEvent: event as Record<string, unknown>,
        });

        if (!verified) {
          res.status(401).json({
            error: 'Invalid PayPal webhook signature',
            code: 'UNAUTHORIZED',
          });
          return;
        }
      } else if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: 'PayPal webhook verification is not configured',
          code: 'PAYMENT_EXECUTION_UNAVAILABLE',
        });
        return;
      } else {
        console.warn(
          '[Countersign] Accepting a PayPal webhook without signature verification (development only).'
        );
      }

      const result = store.processPayPalWebhook(
        event as Record<string, unknown>,
        verified
      );
      res.json({
        received: true,
        duplicate: result.duplicate,
        processed: result.processed,
      });
    })
  );

  // Seed Reset & Golden Demo Runner
  app.post('/api/v1/seed/reset', (_req, res) => {
    store.seedInitialData();
    res.json({ message: 'Store reset to fresh seed state', success: true });
  });

  app.post(
    '/api/v1/seed/golden-demo',
    asyncHandler(async (_req, res) => {
      const agent = store.getDemoAgent();
      const recipient = store.getDemoRecipient();

      if (!agent || !recipient) {
        res.status(409).json({
          error: 'No active agent or approved recipient is available for the demo',
          code: 'DEMO_UNAVAILABLE',
        });
        return;
      }

      const runId = `${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;

      const intent49 = await store.submitPaymentIntent({
        agentId: agent.id,
        recipientName: recipient.displayName,
        recipientEmail: recipient.email,
        amountMinor: 4900,
        currency: 'USD',
        description: 'November software invoice',
        invoiceReference: 'INV-2026-1101',
        idempotencyKey: `golden-${runId}-49`,
      });

      const intent180 = await store.submitPaymentIntent({
        agentId: agent.id,
        recipientName: recipient.displayName,
        recipientEmail: recipient.email,
        amountMinor: 18000,
        currency: 'USD',
        description: 'Quarterly cluster compute reservation',
        invoiceReference: 'INV-2026-1102',
        idempotencyKey: `golden-${runId}-180`,
      });

      res.json({
        intent49: intent49.intent,
        intent180: intent180.intent,
        message:
          'Golden demo intents created: $49.00 pending approval & $180.00 denied.',
      });
    })
  );

  // -------------------------------------------------------------
  // ERROR HANDLING
  // -------------------------------------------------------------
  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (res.headersSent) return;

      if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }

      console.error('[Countersign] Unhandled error:', err);
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  );

  // Unknown API routes must return JSON, not the SPA index.html.
  app.use('/api/v1', (_req, res) => {
    res.status(404).json({ error: 'API route not found', code: 'NOT_FOUND' });
  });

  // -------------------------------------------------------------
  // FRONTEND INTEGRATION (Vite in Dev / Static in Prod)
  // -------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    // Import Vite lazily so the production runtime does not depend on devDependencies.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: HOST,
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  // Settle payouts without depending on webhook delivery.
  const reconcileTimer = setInterval(() => {
    store
      .reconcileOpenPayouts()
      .then((changed) => (changed > 0 ? store.flushPersistence() : undefined))
      .catch((err) => console.warn('[Countersign] Payout reconciliation failed:', err));
  }, 15_000);
  reconcileTimer.unref();

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Countersign] Server listening on http://${HOST}:${PORT}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Countersign] Received ${signal}; flushing state before exit.`);
    try {
      await store.flushPersistence();
    } finally {
      server.close(() => process.exit(0));
      server.closeAllConnections?.();
      setTimeout(() => process.exit(0), 5_000);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[Countersign] Failed to start server:', err);
  process.exit(1);
});
