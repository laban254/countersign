import crypto from 'node:crypto';
import {
  Agent,
  Policy,
  PolicyVersion,
  Recipient,
  PaymentIntent,
  BudgetReservation,
  Approval,
  LedgerEvent,
  SpendingSummary,
  PayPalPayoutRecord,
  PayPalWebhookEvent,
  ReasonCode,
  AgentStatus,
} from '../domain/types.ts';
import { evaluatePolicy } from '../domain/policy/evaluate.ts';
import {
  validatePolicyVersionInput,
  PolicyVersionInput,
} from '../domain/policy/validate.ts';
import {
  computeLedgerHash,
  GENESIS_HASH,
  verifyLedgerChain,
  canonicalJson,
  LedgerEventHashInput,
} from './ledger.ts';
import { payPalService } from './paypal/client.ts';
import { toMajor } from '../domain/money.ts';
import { hashAgentSecret } from './auth.ts';
import {
  AppError,
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
  RevalidationError,
  ValidationError,
} from './errors.ts';
import {
  disconnectPersistence,
  isPersistenceConfigured,
  loadLatestAnchor,
  loadSnapshot,
  saveSnapshot,
} from './persistence.ts';

export interface SubmitPaymentIntentParams {
  agentId: string;
  recipientName: string;
  recipientEmail: string;
  amountMinor: number;
  currency: string;
  description: string;
  invoiceReference: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

interface IdempotencyRecord {
  intentId: string;
  requestHash: string;
}

export interface StoreSnapshot {
  version: 1;
  workspace: { id: string; name: string; createdAt: string };
  user: { id: string; email: string; name: string; role: string };
  agents: Agent[];
  policies: Policy[];
  policyVersions: PolicyVersion[];
  recipients: Recipient[];
  paymentIntents: PaymentIntent[];
  budgetReservations: BudgetReservation[];
  approvals: Approval[];
  ledgerEvents: LedgerEvent[];
  idempotencyMap: Array<[string, IdempotencyRecord]>;
  webhookEvents: PayPalWebhookEvent[];
  eventCounter: number;
}

export function toPublicAgent(agent: Agent): Omit<Agent, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...publicAgent } = agent;
  return publicAgent;
}

const EXPIRABLE_INTENT_STATUSES = new Set([
  'PENDING_APPROVAL',
  'APPROVED',
  'RECEIVED',
]);

class DataStore {
  workspace = {
    id: 'ws_demo_001',
    name: 'Countersign Demo Co.',
    createdAt: '2026-11-01T08:00:00Z',
  };

  user = {
    id: 'usr_owner_001',
    email: 'owner@demo.test',
    name: 'Alex Chen',
    role: 'OWNER',
  };

  agents: Map<string, Agent> = new Map();
  policies: Map<string, Policy> = new Map();
  policyVersions: Map<string, PolicyVersion> = new Map();
  recipients: Map<string, Recipient> = new Map();
  paymentIntents: Map<string, PaymentIntent> = new Map();
  budgetReservations: Map<string, BudgetReservation> = new Map();
  approvals: Map<string, Approval> = new Map();
  ledgerEvents: LedgerEvent[] = [];
  idempotencyMap: Map<string, IdempotencyRecord> = new Map();
  webhookEvents: Map<string, PayPalWebhookEvent> = new Map();

  private eventCounter = 0;
  private persistenceEnabled = false;
  private persistTimer: NodeJS.Timeout | null = null;
  private persistChain: Promise<void> = Promise.resolve();

  constructor() {
    this.seedInitialData();
  }

  seedInitialData(): void {
    this.agents.clear();
    this.policies.clear();
    this.policyVersions.clear();
    this.recipients.clear();
    this.paymentIntents.clear();
    this.budgetReservations.clear();
    this.approvals.clear();
    this.ledgerEvents = [];
    this.idempotencyMap.clear();
    this.webhookEvents.clear();
    this.eventCounter = 0;

    // 1. Genesis ledger event
    this.appendLedgerEvent({
      eventType: 'GENESIS',
      actorType: 'SYSTEM',
      actorId: 'system',
      payload: {
        message: 'Countersign financial control plane initialized',
        workspaceId: this.workspace.id,
        version: '2.0.0',
      },
    });

    // 2. Policy Versions
    const policyId = 'pol_demo_001';
    const v1: PolicyVersion = {
      id: 'pol_ver_001',
      policyId,
      version: 1,
      maxTransactionMinor: 2500,
      dailyLimitMinor: 5000,
      monthlyLimitMinor: 15000,
      approvalMode: 'ALWAYS',
      approvalThresholdMinor: 0,
      allowNewRecipients: false,
      currencyAllowlist: ['USD'],
      status: 'ARCHIVED',
      createdBy: this.user.id,
      createdAt: '2026-11-01T09:00:00Z',
      changeNote: 'Initial strict baseline policy',
    };

    const v2: PolicyVersion = {
      id: 'pol_ver_002',
      policyId,
      version: 2,
      maxTransactionMinor: 5000,
      dailyLimitMinor: 10000,
      monthlyLimitMinor: 25000,
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 2500,
      allowNewRecipients: false,
      currencyAllowlist: ['USD'],
      status: 'ARCHIVED',
      createdBy: this.user.id,
      createdAt: '2026-11-02T10:00:00Z',
      changeNote: 'Increased limits for vendor renewals',
    };

    const v3: PolicyVersion = {
      id: 'pol_ver_003',
      policyId,
      version: 3,
      maxTransactionMinor: 10000,
      dailyLimitMinor: 12000,
      monthlyLimitMinor: 30000,
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 4000,
      allowNewRecipients: false,
      currencyAllowlist: ['USD'],
      status: 'ACTIVE',
      createdBy: this.user.id,
      createdAt: '2026-11-03T08:30:00Z',
      changeNote: 'Active operational policy with $40 countersign threshold',
    };

    this.policyVersions.set(v1.id, v1);
    this.policyVersions.set(v2.id, v2);
    this.policyVersions.set(v3.id, v3);

    const policy: Policy = {
      id: policyId,
      workspaceId: this.workspace.id,
      name: 'Operations Spending Policy',
      description: 'Controls routine operational vendor software & infrastructure disbursements',
      activeVersionId: v3.id,
      createdAt: '2026-11-01T09:00:00Z',
      versions: [v1, v2, v3],
    };
    this.policies.set(policy.id, policy);

    this.appendLedgerEvent({
      eventType: 'POLICY_CREATED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: { policyId: policy.id, name: policy.name },
    });

    this.appendLedgerEvent({
      eventType: 'POLICY_VERSION_ACTIVATED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: {
        policyId: policy.id,
        version: 3,
        maxTransactionMinor: 10000,
        dailyLimitMinor: 12000,
        approvalMode: 'ABOVE_THRESHOLD',
        approvalThresholdMinor: 4000,
      },
    });

    // 3. Agent
    const agentId = 'agt_operations_001';
    const agent: Agent = {
      id: agentId,
      workspaceId: this.workspace.id,
      name: 'operations-agent',
      description: 'Autonomous operations runner handling software renewals & server costs',
      tokenPrefix: `cs_${agentId}`,
      tokenHash: hashAgentSecret(
        process.env.DEMO_AGENT_SECRET || 'live_demo_secret_key_8849'
      ),
      status: 'ACTIVE',
      activePolicyVersionId: v3.id,
      createdAt: '2026-11-02T12:00:00Z',
      lastUsedAt: '2026-11-03T09:00:00Z',
    };
    this.agents.set(agent.id, agent);

    this.appendLedgerEvent({
      eventType: 'AGENT_REGISTERED',
      actorType: 'USER',
      actorId: this.user.id,
      agentId: agent.id,
      payload: { agentId: agent.id, name: agent.name, policyVersionId: v3.id },
    });

    // 4. Recipients
    const rec1: Recipient = {
      id: 'rec_demo_cloud_001',
      workspaceId: this.workspace.id,
      displayName: 'Second Signature Cloud',
      email: process.env.DEMO_RECIPIENT_EMAIL || 'vendor-sandbox@example.test',
      status: 'APPROVED',
      createdAt: '2026-11-02T14:00:00Z',
      createdBy: this.user.id,
    };
    const rec2: Recipient = {
      id: 'rec_legacy_host_002',
      workspaceId: this.workspace.id,
      displayName: 'Unsigned Hosting Ltd',
      email: 'billing@legacy.test',
      status: 'BLOCKED',
      createdAt: '2026-11-02T15:00:00Z',
      createdBy: this.user.id,
    };
    this.recipients.set(rec1.id, rec1);
    this.recipients.set(rec2.id, rec2);

    this.appendLedgerEvent({
      eventType: 'RECIPIENT_ADDED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: {
        recipientId: rec1.id,
        email: rec1.email,
        name: rec1.displayName,
        status: 'APPROVED',
      },
    });

    this.schedulePersist();
  }

  appendLedgerEvent(params: {
    eventType: LedgerEvent['eventType'];
    actorType: LedgerEvent['actorType'];
    actorId: string;
    agentId?: string | null;
    paymentIntentId?: string | null;
    payload: Record<string, unknown>;
  }): LedgerEvent {
    this.eventCounter += 1;
    const prevHash =
      this.ledgerEvents.length === 0
        ? GENESIS_HASH
        : this.ledgerEvents[this.ledgerEvents.length - 1].hash;

    // Normalize the payload to plain JSON before hashing. Persisted snapshots
    // round-trip through JSON, which drops `undefined` properties; hashing the
    // unnormalized object would make the chain unverifiable after a restart.
    const payload = JSON.parse(JSON.stringify(params.payload)) as Record<string, unknown>;

    const createdAt = new Date().toISOString();
    const record: LedgerEventHashInput = {
      id: this.eventCounter,
      workspaceId: this.workspace.id,
      agentId: params.agentId ?? null,
      paymentIntentId: params.paymentIntentId ?? null,
      eventType: params.eventType,
      actorType: params.actorType,
      actorId: params.actorId,
      payload,
      createdAt,
    };

    const event: LedgerEvent = {
      ...record,
      prevHash,
      hash: computeLedgerHash(prevHash, record),
    };
    this.ledgerEvents.push(event);
    this.schedulePersist();
    return event;
  }

  getPublicAgents(): Omit<Agent, 'tokenHash'>[] {
    return Array.from(this.agents.values()).map(toPublicAgent);
  }

  getDemoAgent(): Agent | undefined {
    return Array.from(this.agents.values()).find((agent) => agent.status === 'ACTIVE');
  }

  getDemoRecipient(): Recipient | undefined {
    return Array.from(this.recipients.values()).find(
      (recipient) => recipient.status === 'APPROVED'
    );
  }

  private emptyPolicySnapshot(): PolicyVersion {
    return {
      id: 'pol_none',
      policyId: 'pol_none',
      version: 0,
      maxTransactionMinor: 0,
      dailyLimitMinor: 0,
      monthlyLimitMinor: 0,
      approvalMode: 'ALWAYS',
      approvalThresholdMinor: 0,
      allowNewRecipients: false,
      currencyAllowlist: [],
      status: 'ARCHIVED',
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      changeNote: 'No active policy version',
    };
  }

  private getDefaultActivePolicyVersion(): PolicyVersion | null {
    for (const policy of this.policies.values()) {
      if (!policy.activeVersionId) continue;
      const version = this.policyVersions.get(policy.activeVersionId);
      if (version && version.status === 'ACTIVE') return version;
    }
    return (
      Array.from(this.policyVersions.values()).find(
        (version) => version.status === 'ACTIVE'
      ) ?? null
    );
  }

  /**
   * Load durable state when DATABASE_URL is configured. Without it the store
   * remains an in-memory demo store (used by tests and local development).
   */
  async initialize(): Promise<void> {
    if (!isPersistenceConfigured()) {
      this.persistenceEnabled = false;
      console.log('[Countersign] DATABASE_URL not set; using the in-memory store.');
      return;
    }

    const snapshot = await loadSnapshot<StoreSnapshot>();
    const anchor = await loadLatestAnchor();

    if (snapshot && snapshot.version !== 1) {
      throw new Error(
        `Unsupported persisted snapshot version '${String((snapshot as { version?: unknown }).version)}'.`
      );
    }

    if (snapshot) {
      this.hydrate(snapshot);
      const verification = this.verifyChain();
      if (!verification.valid) {
        throw new Error(
          `Persisted ledger failed verification: ${verification.reason ?? 'unknown error'}`
        );
      }

      if (anchor) {
        const headHash =
          this.ledgerEvents.length === 0
            ? GENESIS_HASH
            : this.ledgerEvents[this.ledgerEvents.length - 1].hash;
        if (
          this.ledgerEvents.length !== anchor.eventCount ||
          headHash !== anchor.headHash
        ) {
          throw new Error(
            `Persisted ledger does not match its latest anchor (events ${this.ledgerEvents.length}/${anchor.eventCount}, head ${headHash.substring(0, 12)}... vs ${anchor.headHash.substring(0, 12)}...).`
          );
        }
      } else {
        console.warn(
          '[Countersign] No ledger anchor found for an existing snapshot; creating one now.'
        );
      }

      console.log(
        `[Countersign] Loaded durable state (${this.ledgerEvents.length} ledger events).`
      );
    } else {
      this.seedInitialData();
      console.log('[Countersign] Initialized a fresh durable store.');
    }

    this.persistenceEnabled = true;
    const headHash =
      this.ledgerEvents.length === 0
        ? GENESIS_HASH
        : this.ledgerEvents[this.ledgerEvents.length - 1].hash;
    await saveSnapshot(this.toSnapshot(), {
      headHash,
      eventCount: this.ledgerEvents.length,
    });
  }

  toSnapshot(): StoreSnapshot {
    const snapshot: StoreSnapshot = {
      version: 1,
      workspace: { ...this.workspace },
      user: { ...this.user },
      agents: Array.from(this.agents.values()),
      // Policy.versions is rebuilt from policyVersions during hydration.
      policies: Array.from(this.policies.values()).map((policy) => ({
        ...policy,
        versions: [],
      })),
      policyVersions: Array.from(this.policyVersions.values()),
      recipients: Array.from(this.recipients.values()),
      // Approval/reservation objects also live in their own maps and are
      // re-linked by paymentIntentId during hydration.
      paymentIntents: Array.from(this.paymentIntents.values()).map((intent) => ({
        ...intent,
        approval: undefined,
        reservation: undefined,
      })),
      budgetReservations: Array.from(this.budgetReservations.values()),
      approvals: Array.from(this.approvals.values()),
      ledgerEvents: this.ledgerEvents,
      idempotencyMap: Array.from(this.idempotencyMap.entries()),
      webhookEvents: Array.from(this.webhookEvents.values()),
      eventCounter: this.eventCounter,
    };

    // Detach the snapshot from live objects and normalize it to plain JSON.
    return JSON.parse(JSON.stringify(snapshot)) as StoreSnapshot;
  }

  hydrate(snapshot: StoreSnapshot): void {
    this.agents.clear();
    this.policies.clear();
    this.policyVersions.clear();
    this.recipients.clear();
    this.paymentIntents.clear();
    this.budgetReservations.clear();
    this.approvals.clear();
    this.webhookEvents.clear();
    this.ledgerEvents = [];
    this.idempotencyMap.clear();
    this.eventCounter = 0;
    this.persistenceEnabled = false;

    this.workspace = { ...snapshot.workspace };
    this.user = { ...snapshot.user };

    for (const agent of snapshot.agents) this.agents.set(agent.id, agent);
    for (const policyVersion of snapshot.policyVersions) {
      this.policyVersions.set(policyVersion.id, policyVersion);
    }
    for (const policy of snapshot.policies) {
      policy.versions = Array.from(this.policyVersions.values()).filter(
        (version) => version.policyId === policy.id
      );
      this.policies.set(policy.id, policy);
    }
    for (const recipient of snapshot.recipients) {
      this.recipients.set(recipient.id, recipient);
    }
    for (const reservation of snapshot.budgetReservations) {
      this.budgetReservations.set(reservation.id, reservation);
    }
    for (const approval of snapshot.approvals) {
      this.approvals.set(approval.id, approval);
    }
    for (const intent of snapshot.paymentIntents) {
      this.paymentIntents.set(intent.id, intent);
    }
    for (const webhookEvent of snapshot.webhookEvents) {
      this.webhookEvents.set(webhookEvent.providerEventId, webhookEvent);
    }

    const approvalsByIntent = new Map(
      Array.from(this.approvals.values()).map((approval) => [
        approval.paymentIntentId,
        approval,
      ])
    );
    const reservationsByIntent = new Map(
      Array.from(this.budgetReservations.values()).map((reservation) => [
        reservation.paymentIntentId,
        reservation,
      ])
    );
    for (const intent of this.paymentIntents.values()) {
      intent.approval = approvalsByIntent.get(intent.id);
      intent.reservation = reservationsByIntent.get(intent.id);
    }

    this.idempotencyMap = new Map(snapshot.idempotencyMap);
    this.ledgerEvents = snapshot.ledgerEvents;
    this.eventCounter = snapshot.eventCounter;
  }

  private schedulePersist(): void {
    if (!this.persistenceEnabled) return;

    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 200);
  }

  private async persistNow(): Promise<void> {
    if (!this.persistenceEnabled) return;

    const snapshot = this.toSnapshot();
    const headHash =
      this.ledgerEvents.length === 0
        ? GENESIS_HASH
        : this.ledgerEvents[this.ledgerEvents.length - 1].hash;
    const eventCount = this.ledgerEvents.length;

    this.persistChain = this.persistChain
      .then(() => saveSnapshot(snapshot, { headHash, eventCount }))
      .catch((err) => {
        console.error('[Countersign] Failed to persist state:', err);
      });

    await this.persistChain;
  }

  async flushPersistence(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }

    if (this.persistenceEnabled) {
      this.persistTimer = null;
      await this.persistNow();
    }

    await disconnectPersistence();
  }

  createAgent(params: {
    name: string;
    description?: string;
    activePolicyVersionId?: string | null;
  }): { agent: Omit<Agent, 'tokenHash'>; rawTokenOnce: string } {
    const name = String(params.name ?? '').trim();
    if (!name) throw new ValidationError('Agent name is required', 'INVALID_REQUEST');

    let policyVersion: PolicyVersion | null = null;
    if (params.activePolicyVersionId) {
      const requested = this.policyVersions.get(params.activePolicyVersionId) ?? null;
      if (!requested || requested.status !== 'ACTIVE') {
        throw new ValidationError(
          'activePolicyVersionId must reference an ACTIVE policy version',
          'INVALID_POLICY_VERSION'
        );
      }
      policyVersion = requested;
    } else {
      policyVersion = this.getDefaultActivePolicyVersion();
    }

    if (!policyVersion) {
      throw new ConflictError(
        'No active policy version is available to assign to a new agent',
        'NO_ACTIVE_POLICY'
      );
    }

    const agentId = `agt_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${crypto
      .randomBytes(4)
      .toString('hex')}`;
    const tokenSecret = crypto.randomBytes(24).toString('hex');
    const fullToken = `cs_${agentId}_${tokenSecret}`;

    const agent: Agent = {
      id: agentId,
      workspaceId: this.workspace.id,
      name,
      description: String(params.description ?? '').trim().slice(0, 500),
      tokenPrefix: `cs_${agentId}`,
      tokenHash: hashAgentSecret(tokenSecret),
      status: 'ACTIVE',
      activePolicyVersionId: policyVersion.id,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };

    this.agents.set(agent.id, agent);
    this.appendLedgerEvent({
      eventType: 'AGENT_REGISTERED',
      actorType: 'USER',
      actorId: this.user.id,
      agentId: agent.id,
      payload: { agentId: agent.id, name: agent.name, policyVersionId: policyVersion.id },
    });

    return { agent: toPublicAgent(agent), rawTokenOnce: fullToken };
  }

  setAgentStatus(agentId: string, status: AgentStatus): Agent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new NotFoundError('Agent not found', 'AGENT_NOT_FOUND');

    if (!['ACTIVE', 'PAUSED', 'REVOKED'].includes(status)) {
      throw new ValidationError('Invalid agent status', 'INVALID_STATUS');
    }
    if (agent.status === 'REVOKED' && status !== 'REVOKED') {
      throw new ConflictError(
        'A revoked agent is terminal and cannot be reactivated.',
        'AGENT_REVOKED'
      );
    }
    if (agent.status === status) return agent;

    const previousStatus = agent.status;
    agent.status = status;

    this.appendLedgerEvent({
      eventType: 'AGENT_STATUS_UPDATED',
      actorType: 'USER',
      actorId: this.user.id,
      agentId: agent.id,
      payload: { agentId: agent.id, previousStatus, newStatus: status },
    });

    return agent;
  }

  rotateAgentToken(agentId: string): {
    agent: Omit<Agent, 'tokenHash'>;
    rawTokenOnce: string;
  } {
    const agent = this.agents.get(agentId);
    if (!agent) throw new NotFoundError('Agent not found', 'AGENT_NOT_FOUND');

    const newSecret = crypto.randomBytes(24).toString('hex');
    const newRawToken = `cs_${agent.id}_${newSecret}`;
    agent.tokenHash = hashAgentSecret(newSecret);

    this.appendLedgerEvent({
      eventType: 'AGENT_TOKEN_ROTATED',
      actorType: 'USER',
      actorId: this.user.id,
      agentId: agent.id,
      payload: {
        agentId: agent.id,
        tokenPrefix: agent.tokenPrefix,
        message: 'Agent authentication secret rotated',
      },
    });

    return { agent: toPublicAgent(agent), rawTokenOnce: newRawToken };
  }

  createPolicyVersion(policyId: string, input: PolicyVersionInput): PolicyVersion {
    const policy = this.policies.get(policyId);
    if (!policy) throw new NotFoundError('Policy not found', 'POLICY_NOT_FOUND');

    const validation = validatePolicyVersionInput(input);
    if (!validation.ok) {
      throw new ValidationError(validation.errors.join('; '), 'INVALID_POLICY_VERSION');
    }

    const existingVersions = Array.from(this.policyVersions.values()).filter(
      (version) => version.policyId === policy.id
    );
    const nextVersionNumber =
      existingVersions.reduce((max, version) => Math.max(max, version.version), 0) + 1;

    const newVersion: PolicyVersion = {
      id: `pol_ver_${crypto.randomBytes(4).toString('hex')}`,
      policyId: policy.id,
      version: nextVersionNumber,
      ...validation.value,
      status: 'DRAFT',
      createdBy: this.user.id,
      createdAt: new Date().toISOString(),
    };

    this.policyVersions.set(newVersion.id, newVersion);
    policy.versions.push(newVersion);

    this.appendLedgerEvent({
      eventType: 'POLICY_VERSION_CREATED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: {
        policyId: policy.id,
        versionId: newVersion.id,
        version: newVersion.version,
        changeNote: newVersion.changeNote,
      },
    });

    return newVersion;
  }

  activatePolicyVersion(
    policyId: string,
    versionId: string
  ): { policy: Policy; activatedVersion: PolicyVersion } {
    const policy = this.policies.get(policyId);
    if (!policy) throw new NotFoundError('Policy not found', 'POLICY_NOT_FOUND');

    const version = this.policyVersions.get(versionId);
    if (!version) throw new NotFoundError('Policy version not found', 'POLICY_VERSION_NOT_FOUND');
    if (version.policyId !== policy.id) {
      throw new ValidationError(
        'The policy version does not belong to the specified policy',
        'POLICY_VERSION_MISMATCH'
      );
    }

    for (const existing of this.policyVersions.values()) {
      if (existing.policyId === policy.id && existing.status === 'ACTIVE') {
        existing.status = 'ARCHIVED';
      }
    }

    version.status = 'ACTIVE';
    policy.activeVersionId = version.id;

    for (const agent of this.agents.values()) {
      const currentVersion = agent.activePolicyVersionId
        ? this.policyVersions.get(agent.activePolicyVersionId)
        : null;
      if (currentVersion?.policyId === policy.id) {
        agent.activePolicyVersionId = version.id;
      }
    }

    this.appendLedgerEvent({
      eventType: 'POLICY_VERSION_ACTIVATED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: {
        policyId: policy.id,
        versionId: version.id,
        version: version.version,
        maxTransactionMinor: version.maxTransactionMinor,
        dailyLimitMinor: version.dailyLimitMinor,
        approvalMode: version.approvalMode,
        approvalThresholdMinor: version.approvalThresholdMinor,
      },
    });

    return { policy, activatedVersion: version };
  }

  createRecipient(params: {
    displayName: string;
    email: string;
    status?: 'APPROVED' | 'BLOCKED';
  }): Recipient {
    const displayName = String(params.displayName ?? '').trim();
    const email = String(params.email ?? '').trim().toLowerCase();
    const status = params.status ?? 'APPROVED';

    if (!displayName) throw new ValidationError('Display name is required', 'INVALID_REQUEST');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('A valid recipient email is required', 'INVALID_EMAIL');
    }
    if (status !== 'APPROVED' && status !== 'BLOCKED') {
      throw new ValidationError('Invalid recipient status', 'INVALID_STATUS');
    }
    for (const existing of this.recipients.values()) {
      if (existing.email.toLowerCase() === email) {
        throw new ConflictError('A recipient with this email already exists', 'RECIPIENT_EXISTS');
      }
    }

    const recipient: Recipient = {
      id: `rec_${crypto.randomBytes(6).toString('hex')}`,
      workspaceId: this.workspace.id,
      displayName: displayName.slice(0, 200),
      email,
      status,
      createdAt: new Date().toISOString(),
      createdBy: this.user.id,
    };

    this.recipients.set(recipient.id, recipient);
    this.appendLedgerEvent({
      eventType: 'RECIPIENT_ADDED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: {
        recipientId: recipient.id,
        email: recipient.email,
        name: recipient.displayName,
        status: recipient.status,
      },
    });

    return recipient;
  }

  setRecipientStatus(recipientId: string, status: 'APPROVED' | 'BLOCKED'): Recipient {
    const recipient = this.recipients.get(recipientId);
    if (!recipient) throw new NotFoundError('Recipient not found', 'RECIPIENT_NOT_FOUND');
    if (status !== 'APPROVED' && status !== 'BLOCKED') {
      throw new ValidationError('Invalid recipient status', 'INVALID_STATUS');
    }
    if (recipient.status === status) return recipient;

    const previousStatus = recipient.status;
    recipient.status = status;
    this.appendLedgerEvent({
      eventType: 'RECIPIENT_STATUS_UPDATED',
      actorType: 'USER',
      actorId: this.user.id,
      payload: {
        recipientId: recipient.id,
        email: recipient.email,
        previousStatus,
        newStatus: status,
      },
    });
    return recipient;
  }

  getSpendingSummary(agentId?: string, excludeIntentId?: string): SpendingSummary {
    this.expireStaleReservations();
    return this.computeSpendingSummary(agentId, excludeIntentId);
  }

  /**
   * Read-only spending view used by the dry-run simulator. It deliberately does
   * not run the reservation sweeper, so a simulation cannot mutate state.
   */
  peekSpendingSummary(agentId?: string): SpendingSummary {
    return this.computeSpendingSummary(agentId);
  }

  private computeSpendingSummary(
    agentId?: string,
    excludeIntentId?: string
  ): SpendingSummary {
    let dailySettled = 0;
    let dailyReserved = 0;
    let monthlySettled = 0;
    let monthlyReserved = 0;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentMonth = now.toISOString().slice(0, 7);

    for (const intent of this.paymentIntents.values()) {
      if (agentId && intent.agentId !== agentId) continue;
      if (intent.status !== 'SUCCEEDED') continue;

      // Settled spend belongs to the period in which it actually settled, not
      // the period in which the request happened to be created.
      const settledAt = intent.reservation?.settledAt ?? intent.updatedAt;
      const intentDay = settledAt.slice(0, 10);
      const intentMonth = settledAt.slice(0, 7);

      if (intentDay === todayStr) dailySettled += intent.amountMinor;
      if (intentMonth === currentMonth) monthlySettled += intent.amountMinor;
    }

    for (const reservation of this.budgetReservations.values()) {
      if (agentId && reservation.agentId !== agentId) continue;
      if (excludeIntentId && reservation.paymentIntentId === excludeIntentId) continue;
      if (reservation.status !== 'HELD') continue;

      const reservationDay = reservation.createdAt.slice(0, 10);
      const reservationMonth = reservation.createdAt.slice(0, 7);

      if (reservationDay === todayStr) dailyReserved += reservation.amountMinor;
      if (reservationMonth === currentMonth) monthlyReserved += reservation.amountMinor;
    }

    const agent = agentId
      ? this.agents.get(agentId)
      : Array.from(this.agents.values())[0];
    const policyVersion = agent?.activePolicyVersionId
      ? this.policyVersions.get(agent.activePolicyVersionId)
      : null;

    const dailyLimit = policyVersion?.dailyLimitMinor ?? 12000;
    const monthlyLimit = policyVersion?.monthlyLimitMinor ?? 30000;

    return {
      workspaceId: this.workspace.id,
      agentId,
      currency: 'USD',
      dailyLimitMinor: dailyLimit,
      monthlyLimitMinor: monthlyLimit,
      dailySettledMinor: dailySettled,
      dailyReservedMinor: dailyReserved,
      dailyAvailableMinor: Math.max(0, dailyLimit - dailySettled - dailyReserved),
      monthlySettledMinor: monthlySettled,
      monthlyReservedMinor: monthlyReserved,
      monthlyAvailableMinor: Math.max(0, monthlyLimit - monthlySettled - monthlyReserved),
    };
  }

  /**
   * Lazy sweeper: release reservations whose approval/execution window elapsed.
   * In-flight payouts are left alone because the provider may still settle them.
   */
  expireStaleReservations(): number {
    const now = Date.now();
    let expired = 0;

    for (const reservation of this.budgetReservations.values()) {
      if (reservation.status !== 'HELD') continue;
      if (new Date(reservation.expiresAt).getTime() > now) continue;

      const intent = this.paymentIntents.get(reservation.paymentIntentId);
      if (intent && !EXPIRABLE_INTENT_STATUSES.has(intent.status)) continue;

      const releasedAt = new Date().toISOString();
      reservation.status = 'EXPIRED';
      reservation.releasedAt = releasedAt;
      expired += 1;

      if (intent) {
        intent.status = 'EXPIRED';
        intent.updatedAt = releasedAt;

        if (intent.approval && intent.approval.decision === null) {
          intent.approval.comment = 'Approval window expired before review.';
          this.appendLedgerEvent({
            eventType: 'APPROVAL_EXPIRED',
            actorType: 'SYSTEM',
            actorId: 'reservations',
            agentId: intent.agentId,
            paymentIntentId: intent.id,
            payload: {
              approvalId: intent.approval.id,
              expiresAt: intent.approval.expiresAt,
            },
          });
        }

        this.appendLedgerEvent({
          eventType: 'RESERVATION_RELEASED',
          actorType: 'SYSTEM',
          actorId: 'reservations',
          agentId: intent.agentId,
          paymentIntentId: intent.id,
          payload: {
            reservationId: reservation.id,
            amountMinor: reservation.amountMinor,
            reason: 'EXPIRED',
          },
        });

        this.appendLedgerEvent({
          eventType: 'INTENT_EXPIRED',
          actorType: 'SYSTEM',
          actorId: 'reservations',
          agentId: intent.agentId,
          paymentIntentId: intent.id,
          payload: {
            reservationId: reservation.id,
            expiresAt: reservation.expiresAt,
          },
        });
      }
    }

    return expired;
  }

  private releaseReservation(intent: PaymentIntent, reason: string): void {
    if (!intent.reservation || intent.reservation.status !== 'HELD') return;

    intent.reservation.status = 'RELEASED';
    intent.reservation.releasedAt = new Date().toISOString();

    this.appendLedgerEvent({
      eventType: 'RESERVATION_RELEASED',
      actorType: 'SYSTEM',
      actorId: 'reservations',
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        reservationId: intent.reservation.id,
        amountMinor: intent.amountMinor,
        reason,
      },
    });
  }

  private settleReservation(intent: PaymentIntent): void {
    if (!intent.reservation || intent.reservation.status !== 'HELD') return;

    intent.reservation.status = 'SETTLED';
    intent.reservation.settledAt = new Date().toISOString();

    this.appendLedgerEvent({
      eventType: 'RESERVATION_SETTLED',
      actorType: 'SYSTEM',
      actorId: 'reservations',
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        reservationId: intent.reservation.id,
        amountMinor: intent.amountMinor,
      },
    });
  }

  async submitPaymentIntent(
    params: SubmitPaymentIntentParams
  ): Promise<{ intent: PaymentIntent; isIdempotentReplay: boolean }> {
    const agent = this.agents.get(params.agentId);
    if (!agent) {
      throw new NotFoundError(`Agent '${params.agentId}' not found`, 'AGENT_NOT_FOUND');
    }

    const recipientEmail = String(params.recipientEmail ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      throw new ValidationError('A valid recipient email is required', 'INVALID_REQUEST');
    }

    if (!Number.isInteger(params.amountMinor) || !Number.isFinite(params.amountMinor)) {
      throw new ValidationError(
        'amountMinor must be a finite integer in minor units',
        'INVALID_REQUEST'
      );
    }

    const currency = String(params.currency ?? 'USD').trim().toUpperCase() || 'USD';
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError('Currency must be a three-letter ISO code', 'INVALID_REQUEST');
    }

    const description =
      String(params.description ?? 'Agent Payment Intent').trim().slice(0, 500) ||
      'Agent Payment Intent';
    const invoiceReference =
      String(params.invoiceReference ?? '').trim().slice(0, 120) ||
      `INV-${Date.now().toString().slice(-6)}`;
    const idempotencyKey =
      String(params.idempotencyKey ?? '').trim().slice(0, 200) ||
      `auto-${crypto.randomUUID()}`;
    const metadata =
      params.metadata && typeof params.metadata === 'object' && !Array.isArray(params.metadata)
        ? params.metadata
        : {};

    const policyVersion = agent.activePolicyVersionId
      ? this.policyVersions.get(agent.activePolicyVersionId) ?? null
      : null;

    const requestHash = crypto
      .createHash('sha256')
      .update(
        canonicalJson({
          agentId: agent.id,
          recipientEmail,
          amountMinor: params.amountMinor,
          currency,
          description,
          invoiceReference,
          metadata,
          policyVersionId: policyVersion?.id ?? 'none',
          policyVersionNumber: policyVersion?.version ?? 0,
        })
      )
      .digest('hex');

    const idempotencyMapKey = `${agent.id}:${idempotencyKey}`;
    const existingRecord = this.idempotencyMap.get(idempotencyMapKey);
    if (existingRecord) {
      const existingIntent = this.paymentIntents.get(existingRecord.intentId);
      if (!existingIntent) {
        throw new AppError(
          'Idempotency record points to a missing payment intent',
          'INTERNAL_ERROR',
          500
        );
      }
      if (existingRecord.requestHash !== requestHash) {
        throw new IdempotencyConflictError();
      }
      return { intent: existingIntent, isIdempotentReplay: true };
    }

    this.expireStaleReservations();

    let matchedRecipient: Recipient | null = null;
    for (const recipient of this.recipients.values()) {
      if (recipient.email.toLowerCase() === recipientEmail) {
        matchedRecipient = recipient;
        break;
      }
    }

    const spending = this.computeSpendingSummary(agent.id);
    const evaluation = evaluatePolicy({
      agent,
      policyVersion,
      recipient: matchedRecipient,
      recipientEmail,
      recipientName: params.recipientName,
      amountMinor: params.amountMinor,
      currency,
      dailySpentAndReservedMinor:
        spending.dailySettledMinor + spending.dailyReservedMinor,
      monthlySpentAndReservedMinor:
        spending.monthlySettledMinor + spending.monthlyReservedMinor,
    });

    const intentId = `pi_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const policySnapshot = policyVersion
      ? structuredClone(policyVersion)
      : this.emptyPolicySnapshot();

    const intent: PaymentIntent = {
      id: intentId,
      workspaceId: this.workspace.id,
      agentId: agent.id,
      agentName: agent.name,
      policyVersionId: policyVersion?.id ?? 'none',
      policySnapshot,
      recipientId: matchedRecipient?.id ?? null,
      recipientSnapshot: {
        displayName:
          params.recipientName || matchedRecipient?.displayName || recipientEmail,
        email: recipientEmail,
        status: matchedRecipient?.status ?? 'NEW',
      },
      amountMinor: params.amountMinor,
      currency,
      description,
      invoiceReference,
      metadata,
      idempotencyKey,
      requestHash,
      decision: evaluation.decision,
      status:
        evaluation.decision === 'DENIED'
          ? 'DENIED'
          : evaluation.decision === 'PENDING_APPROVAL'
            ? 'PENDING_APPROVAL'
            : 'APPROVED',
      reasonCodes: evaluation.reasonCodes,
      explanation: evaluation.explanation,
      checks: evaluation.checks,
      createdAt: now,
      updatedAt: now,
    };

    this.paymentIntents.set(intent.id, intent);
    this.idempotencyMap.set(idempotencyMapKey, {
      intentId: intent.id,
      requestHash,
    });
    agent.lastUsedAt = now;

    this.appendLedgerEvent({
      eventType: 'INTENT_RECEIVED',
      actorType: 'AGENT',
      actorId: agent.id,
      agentId: agent.id,
      paymentIntentId: intent.id,
      payload: {
        intentId: intent.id,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        recipientEmail,
        invoiceReference,
        idempotencyKey,
        requestHash,
      },
    });

    this.appendLedgerEvent({
      eventType: 'POLICY_EVALUATED',
      actorType: 'SYSTEM',
      actorId: 'policy-engine',
      agentId: agent.id,
      paymentIntentId: intent.id,
      payload: {
        decision: evaluation.decision,
        reasonCodes: evaluation.reasonCodes,
        policyVersion: evaluation.policyVersion,
        policyVersionId: intent.policyVersionId,
        explanation: evaluation.explanation,
      },
    });

    if (evaluation.decision === 'PENDING_APPROVAL') {
      const reservation: BudgetReservation = {
        id: `res_${crypto.randomBytes(6).toString('hex')}`,
        paymentIntentId: intent.id,
        agentId: agent.id,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        status: 'HELD',
        createdAt: now,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        releasedAt: null,
        settledAt: null,
      };
      this.budgetReservations.set(reservation.id, reservation);
      intent.reservation = reservation;

      const approval: Approval = {
        id: `appr_${crypto.randomBytes(6).toString('hex')}`,
        paymentIntentId: intent.id,
        requestedAt: now,
        expiresAt: reservation.expiresAt,
        reviewedAt: null,
        reviewedBy: null,
        decision: null,
        snapshotHash: requestHash,
      };
      this.approvals.set(approval.id, approval);
      intent.approval = approval;

      this.appendLedgerEvent({
        eventType: 'BUDGET_RESERVED',
        actorType: 'SYSTEM',
        actorId: 'reservations',
        agentId: agent.id,
        paymentIntentId: intent.id,
        payload: {
          reservationId: reservation.id,
          amountMinor: reservation.amountMinor,
          expiresAt: reservation.expiresAt,
          status: 'HELD',
        },
      });

      this.appendLedgerEvent({
        eventType: 'APPROVAL_REQUESTED',
        actorType: 'SYSTEM',
        actorId: 'approval-orchestrator',
        agentId: agent.id,
        paymentIntentId: intent.id,
        payload: {
          approvalId: approval.id,
          snapshotHash: approval.snapshotHash,
          reasonCodes: evaluation.reasonCodes,
          expiresAt: approval.expiresAt,
        },
      });
    }

    if (evaluation.decision === 'AUTHORIZED') {
      const reservation: BudgetReservation = {
        id: `res_${crypto.randomBytes(6).toString('hex')}`,
        paymentIntentId: intent.id,
        agentId: agent.id,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        status: 'HELD',
        createdAt: now,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        releasedAt: null,
        settledAt: null,
      };
      this.budgetReservations.set(reservation.id, reservation);
      intent.reservation = reservation;

      this.appendLedgerEvent({
        eventType: 'BUDGET_RESERVED',
        actorType: 'SYSTEM',
        actorId: 'reservations',
        agentId: agent.id,
        paymentIntentId: intent.id,
        payload: {
          reservationId: reservation.id,
          amountMinor: reservation.amountMinor,
          expiresAt: reservation.expiresAt,
          status: 'HELD',
        },
      });

      await this.executePayoutForIntent(intent);
    }

    return { intent, isIdempotentReplay: false };
  }

  async approvePaymentIntent(
    intentId: string,
    reviewedBy = 'Alex Chen (Owner)',
    comment?: string
  ): Promise<PaymentIntent> {
    const intent = this.paymentIntents.get(intentId);
    if (!intent) {
      throw new NotFoundError('Payment intent not found', 'PAYMENT_INTENT_NOT_FOUND');
    }
    if (intent.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(
        `Cannot approve payment in status '${intent.status}'`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.expireStaleReservations();

    // Re-read after the sweeper may have expired the intent.
    if (intent.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(
        `Cannot approve payment in status '${intent.status}'`,
        'INVALID_STATE_TRANSITION'
      );
    }

    if (!intent.approval) {
      throw new ConflictError(
        'Approval record is missing for this pending intent',
        'INVALID_STATE_TRANSITION'
      );
    }

    const now = Date.now();
    if (new Date(intent.approval.expiresAt).getTime() <= now) {
      const expiredAt = new Date().toISOString();
      intent.status = 'EXPIRED';
      intent.updatedAt = expiredAt;
      intent.approval.comment = 'Approval window expired before review.';
      this.releaseReservation(intent, 'APPROVAL_EXPIRED');
      this.appendLedgerEvent({
        eventType: 'APPROVAL_EXPIRED',
        actorType: 'SYSTEM',
        actorId: 'approvals',
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          approvalId: intent.approval.id,
          expiresAt: intent.approval.expiresAt,
        },
      });
      this.appendLedgerEvent({
        eventType: 'INTENT_EXPIRED',
        actorType: 'SYSTEM',
        actorId: 'approvals',
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          approvalId: intent.approval.id,
          expiresAt: intent.approval.expiresAt,
        },
      });
      throw new RevalidationError('Approval window has expired', 'APPROVAL_EXPIRED');
    }
    if (
      !intent.reservation ||
      intent.reservation.status !== 'HELD' ||
      new Date(intent.reservation.expiresAt).getTime() <= now
    ) {
      this.expireStaleReservations();
      throw new RevalidationError(
        'Budget reservation is no longer held',
        'RESERVATION_EXPIRED'
      );
    }

    const agent = this.agents.get(intent.agentId);
    if (!agent) {
      this.failRevalidation(intent, ['AGENT_INACTIVE'], 'The initiating agent no longer exists.');
    }
    if (agent.status !== 'ACTIVE') {
      const reason: ReasonCode =
        agent.status === 'REVOKED' ? 'AGENT_REVOKED' : 'AGENT_INACTIVE';
      this.failRevalidation(
        intent,
        [reason],
        `The initiating agent is ${agent.status} and can no longer execute payments.`
      );
    }

    if (!intent.policyVersionId || intent.policyVersionId === 'none') {
      this.failRevalidation(
        intent,
        ['NO_ACTIVE_POLICY'],
        'The request has no policy version snapshot.'
      );
    }

    if (agent.activePolicyVersionId !== intent.policyVersionId) {
      this.failRevalidation(
        intent,
        ['POLICY_CHANGED_SINCE_APPROVAL'],
        'The agent policy changed after this request was created. A new request is required.'
      );
    }

    const currentPolicyVersion = this.policyVersions.get(intent.policyVersionId);
    if (!currentPolicyVersion || currentPolicyVersion.status !== 'ACTIVE') {
      this.failRevalidation(
        intent,
        ['POLICY_CHANGED_SINCE_APPROVAL'],
        'The policy version attached to this request is no longer active.'
      );
    }

    let matchedRecipient: Recipient | null = null;
    for (const recipient of this.recipients.values()) {
      if (
        recipient.email.toLowerCase() === intent.recipientSnapshot.email.toLowerCase()
      ) {
        matchedRecipient = recipient;
        break;
      }
    }

    const spending = this.computeSpendingSummary(agent.id, intent.id);
    const evaluation = evaluatePolicy({
      agent,
      policyVersion: intent.policySnapshot,
      recipient: matchedRecipient,
      recipientEmail: intent.recipientSnapshot.email,
      recipientName: intent.recipientSnapshot.displayName,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      dailySpentAndReservedMinor:
        spending.dailySettledMinor + spending.dailyReservedMinor,
      monthlySpentAndReservedMinor:
        spending.monthlySettledMinor + spending.monthlyReservedMinor,
    });

    if (evaluation.decision === 'DENIED') {
      this.failRevalidation(intent, evaluation.reasonCodes, evaluation.explanation);
    }

    this.appendLedgerEvent({
      eventType: 'INTENT_REVALIDATED',
      actorType: 'SYSTEM',
      actorId: 'policy-engine',
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        decision: evaluation.decision,
        reasonCodes: evaluation.reasonCodes,
        policyVersionId: intent.policyVersionId,
        snapshotHash: intent.approval?.snapshotHash,
      },
    });

    const reviewedAt = new Date().toISOString();
    if (intent.approval) {
      intent.approval.decision = 'APPROVED';
      intent.approval.reviewedAt = reviewedAt;
      intent.approval.reviewedBy = reviewedBy;
      intent.approval.comment = comment;
    }

    intent.status = 'APPROVED';
    intent.updatedAt = reviewedAt;

    this.appendLedgerEvent({
      eventType: 'APPROVAL_GRANTED',
      actorType: 'USER',
      actorId: reviewedBy,
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        approvalId: intent.approval?.id,
        snapshotHash: intent.approval?.snapshotHash,
        reviewedBy,
        comment,
      },
    });

    await this.executePayoutForIntent(intent);
    return intent;
  }

  async rejectPaymentIntent(
    intentId: string,
    reviewedBy = 'Alex Chen (Owner)',
    comment?: string
  ): Promise<PaymentIntent> {
    const intent = this.paymentIntents.get(intentId);
    if (!intent) {
      throw new NotFoundError('Payment intent not found', 'PAYMENT_INTENT_NOT_FOUND');
    }
    if (intent.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(
        `Cannot reject payment in status '${intent.status}'`,
        'INVALID_STATE_TRANSITION'
      );
    }

    this.expireStaleReservations();
    if (intent.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(
        `Cannot reject payment in status '${intent.status}'`,
        'INVALID_STATE_TRANSITION'
      );
    }

    const reviewedAt = new Date().toISOString();
    if (intent.approval) {
      intent.approval.decision = 'REJECTED';
      intent.approval.reviewedAt = reviewedAt;
      intent.approval.reviewedBy = reviewedBy;
      intent.approval.comment = comment;
    }

    intent.status = 'REJECTED';
    intent.updatedAt = reviewedAt;

    this.releaseReservation(intent, 'HUMAN_REJECTION');

    this.appendLedgerEvent({
      eventType: 'APPROVAL_REJECTED',
      actorType: 'USER',
      actorId: reviewedBy,
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        approvalId: intent.approval?.id,
        reviewedBy,
        comment,
      },
    });

    return intent;
  }

  private failRevalidation(
    intent: PaymentIntent,
    reasonCodes: ReasonCode[],
    message: string
  ): never {
    const failedAt = new Date().toISOString();

    intent.decision = 'DENIED';
    intent.status = 'DENIED';
    intent.reasonCodes = reasonCodes;
    intent.explanation = message;
    intent.updatedAt = failedAt;

    if (intent.approval && intent.approval.decision === null) {
      intent.approval.decision = 'REJECTED';
      intent.approval.reviewedAt = failedAt;
      intent.approval.reviewedBy = 'system:revalidation';
      intent.approval.comment = message;
    }

    this.releaseReservation(intent, 'REVALIDATION_FAILED');

    this.appendLedgerEvent({
      eventType: 'INTENT_REVALIDATION_FAILED',
      actorType: 'SYSTEM',
      actorId: 'policy-engine',
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        reasonCodes,
        explanation: message,
        policyVersionId: intent.policyVersionId,
      },
    });

    throw new RevalidationError(message, reasonCodes[0] ?? 'REVALIDATION_FAILED');
  }

  private async executePayoutForIntent(intent: PaymentIntent): Promise<void> {
    if (
      intent.status === 'SUCCEEDED' ||
      intent.status === 'FAILED' ||
      intent.status === 'REFUNDED'
    ) {
      return;
    }

    intent.status = 'EXECUTING';
    intent.updatedAt = new Date().toISOString();

    this.appendLedgerEvent({
      eventType: 'PAYOUT_SUBMITTED',
      actorType: 'SYSTEM',
      actorId: 'payout-orchestrator',
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        amountMajor: toMajor(intent.amountMinor),
        currency: intent.currency,
        recipient: intent.recipientSnapshot.email,
        payoutBatchId: null,
      },
    });

    let payoutResult;
    try {
      payoutResult = await payPalService.executePayout({
        intentId: intent.id,
        recipientEmail: intent.recipientSnapshot.email,
        recipientName: intent.recipientSnapshot.displayName,
        amountMajor: toMajor(intent.amountMinor),
        currency: intent.currency,
        note: `${intent.invoiceReference} — ${intent.description}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      payoutResult = {
        success: false,
        payoutBatchId: '',
        payoutItemId: '',
        transactionId: '',
        batchStatus: 'FAILED',
        itemStatus: 'FAILED',
        isSimulated: false,
        rawResponse: {},
        error: message,
      };
    }

    const payoutRecord: PayPalPayoutRecord = {
      id: `pp_${crypto.randomBytes(6).toString('hex')}`,
      paymentIntentId: intent.id,
      payoutBatchId: payoutResult.payoutBatchId,
      payoutItemId: payoutResult.payoutItemId,
      transactionId: payoutResult.transactionId,
      batchStatus: payoutResult.batchStatus,
      itemStatus: payoutResult.itemStatus,
      rawResponse: payoutResult.rawResponse,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    intent.payout = payoutRecord;
    intent.updatedAt = payoutRecord.updatedAt;

    const itemStatus = String(payoutResult.itemStatus || '').toUpperCase();
    const batchStatus = String(payoutResult.batchStatus || '').toUpperCase();
    const successfulStatuses = new Set(['SUCCESS', 'SUCCEEDED', 'COMPLETED']);
    const failedStatuses = new Set([
      'FAILED',
      'DENIED',
      'BLOCKED',
      'RETURNED',
      'CANCELED',
      'CANCELLED',
      'REVERSED',
    ]);

    if (
      !payoutResult.success ||
      failedStatuses.has(itemStatus) ||
      failedStatuses.has(batchStatus)
    ) {
      intent.status = 'FAILED';
      this.releaseReservation(intent, 'PAYOUT_FAILED');
      this.appendLedgerEvent({
        eventType: 'PAYOUT_FAILED',
        actorType: 'PAYPAL',
        actorId: 'paypal-payouts-api',
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          payoutBatchId: payoutResult.payoutBatchId || null,
          batchStatus,
          itemStatus,
          error: payoutResult.error,
        },
      });
      return;
    }

    if (
      successfulStatuses.has(itemStatus) ||
      (payoutResult.isSimulated && successfulStatuses.has(batchStatus))
    ) {
      intent.status = 'SUCCEEDED';
      this.settleReservation(intent);
      this.appendLedgerEvent({
        eventType: 'PAYOUT_SUCCEEDED',
        actorType: 'PAYPAL',
        actorId: payoutResult.isSimulated ? 'paypal-simulator' : 'paypal-payouts-api',
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          payoutBatchId: payoutResult.payoutBatchId,
          transactionId: payoutResult.transactionId,
          itemStatus,
          batchStatus,
          isSimulated: payoutResult.isSimulated,
        },
      });
      return;
    }

    // PayPal accepted the request but the item is not final yet. Keep the
    // budget reservation HELD until a webhook or reconciliation poll settles it.
    const mappedStatus: PaymentIntent['status'] =
      itemStatus === 'UNCLAIMED' ? 'UNCLAIMED' : itemStatus === 'HELD' ? 'HELD' : 'PENDING';
    intent.status = mappedStatus;

    this.appendLedgerEvent({
      eventType: 'PAYOUT_STATUS_CHANGED',
      actorType: 'PAYPAL',
      actorId: payoutResult.isSimulated ? 'paypal-simulator' : 'paypal-payouts-api',
      agentId: intent.agentId,
      paymentIntentId: intent.id,
      payload: {
        payoutBatchId: payoutResult.payoutBatchId,
        batchStatus,
        itemStatus,
        status: mappedStatus,
        isSimulated: payoutResult.isSimulated,
      },
    });
  }

  processPayPalWebhook(
    event: Record<string, unknown>,
    signatureVerified: boolean
  ): { duplicate: boolean; processed: boolean } {
    const providerEventId = typeof event.id === 'string' ? event.id : '';
    const eventType = typeof event.event_type === 'string' ? event.event_type : '';
    if (!providerEventId || !eventType) {
      throw new ValidationError(
        'Webhook event must include id and event_type',
        'INVALID_WEBHOOK'
      );
    }

    const existing = this.webhookEvents.get(providerEventId);
    if (existing) {
      return {
        duplicate: true,
        processed: existing.processingStatus === 'PROCESSED',
      };
    }

    const webhookEvent: PayPalWebhookEvent = {
      id: `whe_${crypto.randomBytes(6).toString('hex')}`,
      providerEventId,
      eventType,
      payload: event,
      signatureVerified,
      processingStatus: 'RECEIVED',
      receivedAt: new Date().toISOString(),
      processedAt: null,
    };
    this.webhookEvents.set(providerEventId, webhookEvent);

    this.appendLedgerEvent({
      eventType: 'WEBHOOK_RECEIVED',
      actorType: 'PAYPAL',
      actorId: 'paypal-webhook',
      payload: { providerEventId, eventType, signatureVerified },
    });

    const resource =
      event.resource && typeof event.resource === 'object'
        ? (event.resource as Record<string, unknown>)
        : {};
    const intent = this.findIntentForWebhook(resource);

    if (!intent) {
      webhookEvent.processingStatus = 'IGNORED';
      webhookEvent.processedAt = new Date().toISOString();
      return { duplicate: false, processed: false };
    }

    const processingStatus = this.applyWebhookStatus(intent, eventType, resource);
    webhookEvent.processingStatus = processingStatus;
    webhookEvent.processedAt = new Date().toISOString();

    return { duplicate: false, processed: processingStatus === 'PROCESSED' };
  }

  /**
   * Poll PayPal for the current state of a submitted payout and apply it, so
   * settlement does not depend solely on a webhook being delivered.
   */
  async reconcilePayout(paymentIntentId: string): Promise<PaymentIntent> {
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent) throw new NotFoundError('Payment intent not found');
    const open = new Set(['PENDING', 'HELD', 'UNCLAIMED']);
    if (!intent.payout || !open.has(intent.status)) return intent;

    const remote = await payPalService.fetchPayoutStatus(intent.payout.payoutBatchId);
    if (!remote) return intent;

    const item = remote.itemStatus.toUpperCase();
    const eventType =
      item === 'SUCCESS'
        ? 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED'
        : ['FAILED', 'DENIED', 'BLOCKED', 'RETURNED', 'CANCELED', 'REVERSED'].includes(item)
          ? `PAYMENT.PAYOUTS-ITEM.${item}`
          : item === 'UNCLAIMED'
            ? 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED'
            : item === 'HELD'
              ? 'PAYMENT.PAYOUTS-ITEM.HELD'
              : '';
    if (!eventType) return intent;

    this.applyWebhookStatus(
      intent,
      eventType,
      {
        payout_item_id: remote.payoutItemId,
        transaction_id: remote.transactionId,
        transaction_status: remote.itemStatus,
      },
      'RECONCILIATION'
    );
    return intent;
  }

  /** Reconcile every open payout; used by the background poller. */
  async reconcileOpenPayouts(): Promise<number> {
    let changed = 0;
    for (const intent of Array.from(this.paymentIntents.values())) {
      if (!intent.payout || !['PENDING', 'HELD', 'UNCLAIMED'].includes(intent.status)) continue;
      const before = intent.status;
      await this.reconcilePayout(intent.id);
      if (intent.status !== before) changed += 1;
    }
    return changed;
  }

  private findIntentForWebhook(resource: Record<string, unknown>): PaymentIntent | null {
    const payoutItemId =
      typeof resource.payout_item_id === 'string' ? resource.payout_item_id : '';
    const transactionId =
      typeof resource.transaction_id === 'string' ? resource.transaction_id : '';
    const batchHeader =
      resource.batch_header && typeof resource.batch_header === 'object'
        ? (resource.batch_header as Record<string, unknown>)
        : undefined;
    const payoutBatchId =
      typeof resource.payout_batch_id === 'string'
        ? resource.payout_batch_id
        : typeof batchHeader?.payout_batch_id === 'string'
          ? (batchHeader.payout_batch_id as string)
          : '';

    for (const intent of this.paymentIntents.values()) {
      if (!intent.payout) continue;
      if (payoutItemId && intent.payout.payoutItemId === payoutItemId) return intent;
      if (transactionId && intent.payout.transactionId === transactionId) return intent;
      if (payoutBatchId && intent.payout.payoutBatchId === payoutBatchId) return intent;
    }
    return null;
  }

  private applyWebhookStatus(
    intent: PaymentIntent,
    eventType: string,
    resource: Record<string, unknown>,
    source: 'WEBHOOK' | 'RECONCILIATION' = 'WEBHOOK'
  ): PayPalWebhookEvent['processingStatus'] {
    const actorId = source === 'WEBHOOK' ? 'paypal-webhook' : 'paypal-reconciliation';
    const upperEventType = eventType.toUpperCase();
    const now = new Date().toISOString();

    if (intent.payout) {
      if (typeof resource.payout_item_id === 'string') {
        intent.payout.payoutItemId = resource.payout_item_id;
      }
      if (typeof resource.transaction_id === 'string') {
        intent.payout.transactionId = resource.transaction_id;
      }
      if (typeof resource.transaction_status === 'string') {
        intent.payout.itemStatus = resource.transaction_status;
      }
      intent.payout.updatedAt = now;
    }
    intent.updatedAt = now;

    const isSuccess =
      upperEventType.includes('SUCCEEDED') ||
      upperEventType.includes('SUCCESS') ||
      upperEventType.includes('COMPLETED');
    const isFailure =
      upperEventType.includes('FAILED') ||
      upperEventType.includes('RETURNED') ||
      upperEventType.includes('BLOCKED') ||
      upperEventType.includes('DENIED');
    const isRefund = upperEventType.includes('REFUNDED');
    const isHold =
      upperEventType.includes('UNCLAIMED') || upperEventType.includes('HELD');

    if (isSuccess) {
      intent.status = 'SUCCEEDED';
      this.settleReservation(intent);
      this.appendLedgerEvent({
        eventType: 'PAYOUT_SUCCEEDED',
        actorType: 'PAYPAL',
        actorId,
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          payoutBatchId: intent.payout?.payoutBatchId ?? null,
          transactionId: intent.payout?.transactionId ?? null,
          itemStatus: intent.payout?.itemStatus ?? null,
          source,
        },
      });
      return 'PROCESSED';
    }

    if (isFailure) {
      intent.status = 'FAILED';
      this.releaseReservation(intent, 'PAYOUT_FAILED_WEBHOOK');
      this.appendLedgerEvent({
        eventType: 'PAYOUT_FAILED',
        actorType: 'PAYPAL',
        actorId,
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          payoutBatchId: intent.payout?.payoutBatchId ?? null,
          itemStatus: intent.payout?.itemStatus ?? null,
          source,
        },
      });
      return 'PROCESSED';
    }

    if (isRefund) {
      intent.status = 'REFUNDED';
      this.releaseReservation(intent, 'PAYMENT_REFUNDED');
      this.appendLedgerEvent({
        eventType: 'PAYOUT_STATUS_CHANGED',
        actorType: 'PAYPAL',
        actorId,
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          payoutBatchId: intent.payout?.payoutBatchId ?? null,
          status: 'REFUNDED',
          source,
        },
      });
      return 'PROCESSED';
    }

    if (isHold) {
      intent.status = upperEventType.includes('UNCLAIMED') ? 'UNCLAIMED' : 'HELD';
      this.appendLedgerEvent({
        eventType: 'PAYOUT_STATUS_CHANGED',
        actorType: 'PAYPAL',
        actorId,
        agentId: intent.agentId,
        paymentIntentId: intent.id,
        payload: {
          payoutBatchId: intent.payout?.payoutBatchId ?? null,
          status: intent.status,
          source,
        },
      });
      return 'PROCESSED';
    }

    return 'IGNORED';
  }

  verifyChain(): {
    valid: boolean;
    totalEvents: number;
    headHash: string;
    reason?: string;
    brokenIndex?: number;
  } {
    return verifyLedgerChain(this.ledgerEvents);
  }
}

export const store = new DataStore();
