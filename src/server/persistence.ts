import { PrismaClient, Prisma } from '@prisma/client';

const SNAPSHOT_ID = 'singleton';

let prisma: PrismaClient | null = null;

export interface LedgerAnchorRecord {
  headHash: string;
  eventCount: number;
}

export function isPersistenceConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getClient(): PrismaClient {
  if (!isPersistenceConfigured()) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/**
 * Load the last durable runtime snapshot. Returns null on a fresh database.
 * Throws when DATABASE_URL is configured but the database/table is unavailable,
 * so a production server fails closed instead of silently starting empty.
 */
export async function loadSnapshot<T>(): Promise<T | null> {
  const client = getClient();
  const row = await client.runtimeSnapshot.findUnique({ where: { id: SNAPSHOT_ID } });
  if (!row) return null;
  return row.data as unknown as T;
}

/**
 * Read the newest ledger anchor. Anchors are append-only: every snapshot save
 * adds one, so dropping events from the snapshot leaves a mismatch.
 */
export async function loadLatestAnchor(): Promise<LedgerAnchorRecord | null> {
  const client = getClient();
  const row = await client.ledgerAnchor.findFirst({
    orderBy: { id: 'desc' },
  });
  if (!row) return null;
  return { headHash: row.headHash, eventCount: row.eventCount };
}

/**
 * Persist a complete runtime snapshot and append a ledger anchor atomically.
 */
export async function saveSnapshot<T>(
  snapshot: T,
  anchor: LedgerAnchorRecord
): Promise<void> {
  const client = getClient();
  const data = JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;

  await client.$transaction([
    client.runtimeSnapshot.upsert({
      where: { id: SNAPSHOT_ID },
      create: { id: SNAPSHOT_ID, data },
      update: { data },
    }),
    client.ledgerAnchor.create({
      data: {
        headHash: anchor.headHash,
        eventCount: anchor.eventCount,
      },
    }),
  ]);
}

export async function disconnectPersistence(): Promise<void> {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
}
