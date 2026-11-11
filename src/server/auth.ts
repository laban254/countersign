import crypto from 'node:crypto';
import { Agent } from '../domain/types.ts';

const TOKEN_PREFIX = 'cs_';

function tokenPepper(): string {
  return process.env.AGENT_TOKEN_PEPPER || '';
}

/**
 * Hash an agent secret with the configured pepper. The raw secret is never
 * persisted, and the pepper prevents an attacker with database access from
 * precomputing hashes for known demo tokens.
 */
export function hashAgentSecret(secret: string): string {
  return crypto.createHmac('sha256', tokenPepper()).update(secret).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function stripBearer(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('Bearer ') ? trimmed.slice(7).trim() : trimmed;
}

/**
 * Verify an agent bearer token shaped `cs_<agentId>_<secret>`.
 *
 * Lookup is by the stored token prefix, so agent IDs containing underscores
 * are handled correctly. The secret is compared against the stored HMAC in
 * constant time.
 */
export function verifyAgentToken(
  authorizationHeader: string | string[] | undefined,
  agents: Iterable<Agent>
): Agent | null {
  const raw = stripBearer(Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader);
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  // Longest prefix first so a shorter agent ID cannot shadow a longer one.
  const candidates = Array.from(agents).sort(
    (a, b) => b.tokenPrefix.length - a.tokenPrefix.length
  );

  for (const agent of candidates) {
    const prefix = agent.tokenPrefix.endsWith('_')
      ? agent.tokenPrefix
      : `${agent.tokenPrefix}_`;

    if (!raw.startsWith(prefix)) continue;

    const secret = raw.slice(prefix.length);
    if (!secret) return null;

    return timingSafeEqualHex(agent.tokenHash, hashAgentSecret(secret)) ? agent : null;
  }

  return null;
}

export function getAdminToken(): string | null {
  const token = process.env.ADMIN_TOKEN?.trim();
  return token ? token : null;
}

export function isAdminAuthRequired(): boolean {
  return Boolean(getAdminToken());
}

/**
 * Constant-time comparison for the dashboard admin token.
 * When no ADMIN_TOKEN is configured, dashboard auth is disabled (dev/demo mode).
 */
export function verifyAdminToken(value: string | string[] | undefined): boolean {
  const expected = getAdminToken();
  if (!expected) return true;

  const provided = stripBearer(Array.isArray(value) ? value[0] : value);
  if (!provided) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export type DashboardRole = 'admin' | 'judge';

/**
 * Optional public "judge" token. When set, the landing page can sign visitors in with it.
 * It is a separate credential from ADMIN_TOKEN, so it can be rotated or removed (unset the
 * variable and restart) without exposing the operator token. Judges get a restricted role.
 */
export function getDemoPublicToken(): string | null {
  const token = process.env.DEMO_PUBLIC_TOKEN?.trim();
  return token && token.length >= 16 ? token : null;
}

export function isDemoModeEnabled(): boolean {
  return isAdminAuthRequired() && getDemoPublicToken() !== null;
}

function constantTimeEquals(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Resolve the dashboard role for a credential: 'admin' (ADMIN_TOKEN), 'judge'
 * (DEMO_PUBLIC_TOKEN), or null. With no ADMIN_TOKEN configured the dashboard is open (dev).
 */
export function resolveDashboardRole(
  value: string | string[] | undefined
): DashboardRole | null {
  if (!isAdminAuthRequired()) return 'admin';
  const provided = stripBearer(Array.isArray(value) ? value[0] : value);
  if (!provided) return null;
  if (verifyAdminToken(provided)) return 'admin';
  const demo = getDemoPublicToken();
  if (demo && constantTimeEquals(provided, demo)) return 'judge';
  return null;
}

/**
 * Production must not silently fall back to an unauthenticated dashboard.
 */
export function assertProductionAuthConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (!getAdminToken()) {
    throw new Error(
      'ADMIN_TOKEN is required in production. Set it to protect dashboard and seed endpoints.'
    );
  }

  const pepper = process.env.AGENT_TOKEN_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error(
      'AGENT_TOKEN_PEPPER is required in production (minimum 16 characters).'
    );
  }
}
