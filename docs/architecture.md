# Countersign Architecture

Countersign is an authorization and audit layer sitting between autonomous AI agents and payment execution.

```text
                      Autonomous AI Agent
                              │
               POST /api/v1/agent/payment-intents
               (Bearer cs_agt_..., Idempotency-Key)
                              │
                              ▼
        ┌───────────────────────────────────────────────┐
        │            Agent Identity & Auth              │
        │   O(1) lookup by prefix + constant-time HMAC  │
        └─────────────────────┬─────────────────────────┘
                              │
                              ▼
        ┌───────────────────────────────────────────────┐
        │          Deterministic Policy Engine          │
        │     Pure function, zero I/O, closed taxonomy  │
        │  Checks: status, currency, limits, allowlist  │
        └──────┬──────────────────────┬─────────────────┘
               │                      │
       DENIED  │      PENDING_APPROVAL│      AUTHORIZED
       ────────┤      ────────────────┤      ───────────┐
       │       │                      │                 │
       ▼       ▼                      ▼                 ▼
  [Record] [Ledger]           [Budget Reservation]   [Budget Reservation]
                              (status = HELD)        (status = HELD)
                                      │                 │
                                      ▼                 ▼
                              [Human Countersign]   [PayPal Payouts]
                              (Approval queue)      (Sandbox API)
                                      │                 │
                                      └─────────────────┘
                                                │
                                                ▼
                                    [Append-Only Ledger]
                                  (HMAC-SHA256 Hash Chain)
```

## Core Tenets

1. **Deterministic Authority**: All monetary limits, approval rules, and allowlists are evaluated by a pure TypeScript engine. AI models suggest drafts or explain records, but have no authority over state changes.
2. **Validated Policies**: Policy versions are validated before persistence (finite minor-unit integers, ordering, required thresholds). Missing or NaN thresholds fail closed.
3. **Immutable Snapshots + Revalidation**: Each intent deep-clones its policy snapshot. Approval re-checks the current agent status, active policy version, recipient status, and budget (excluding the intent's own reservation) before execution.
4. **Budget Reservations**: Amounts are reserved (`HELD`) immediately upon approval or queueing, preventing double-spend and race conditions under concurrent requests. A lazy sweeper releases expired reservations.
5. **Three-Layer Idempotency**:
   - Client → Countersign: `Idempotency-Key` header, scoped to the authenticated agent. A conflicting payload returns `409 IDEMPOTENCY_KEY_REUSED`.
   - Countersign → PayPal: `PayPal-Request-Id`.
   - Batch identity: deterministic `sender_batch_id` derived from intent ID.
6. **Append-Only Cryptographic Audit**: Every event (intent, evaluation, revalidation, approval, payout, settlement, webhook) is chained via `HMAC-SHA256(secret, prev_hash || canonical_json(full_event_record))`. Event type, actor, references, payload, and timestamp are all covered.
7. **Verified Provider Events**: PayPal webhooks are signature-verified when configured, deduplicated by provider event ID, and reconciled against stored payout references. Pending responses remain reserved until confirmed.

## Authentication Boundaries

```text
Dashboard / operator ── Bearer ADMIN_TOKEN ──┐
                                            ├──> /api/v1 dashboard, policy, seed routes
AI agent ── Bearer cs_<agentId>_<secret> ────┴──> /api/v1/agent/* (peppered HMAC, constant-time)
PayPal ── transmission signature ───────────────> /api/v1/webhooks/paypal
```

`ADMIN_TOKEN` is required in production and optional in development. Agent tokens are issued once,
stored only as HMAC-SHA256 hashes, and cannot be overridden by a body `agent_id`.

## Runtime & Persistence

The runtime store (`src/server/store.ts`) is in memory by default. When `DATABASE_URL` is set, it
persists a JSON snapshot plus an append-only ledger anchor (`head_hash`, `event_count`) in one
Postgres transaction after state changes. Startup verifies the full chain and checks the snapshot
against the latest anchor, rejecting a truncated or mismatched ledger. Without `DATABASE_URL`,
state and the ledger reset on restart.

The normalized entity tables in `prisma/schema.prisma` remain the target model; the snapshot path is
a pragmatic durability layer, not a per-entity repository implementation.
