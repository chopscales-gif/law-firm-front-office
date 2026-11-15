import { asc, count, eq, inArray, lt, sql } from "drizzle-orm";
import { DEMO_FIRM } from "@/lib/intake";
import type { Db } from "./client";
import { sandboxes } from "./schema";
import { seedSandbox } from "./seed";

const SANDBOX_LIFETIME_MS = 48 * 3600_000;
/** The most sandboxes kept at once. Past this, the oldest make room for new visitors. */
export const MAX_SANDBOXES = 300;
/** Housekeeping removes at most this many per new visitor, so nobody's first page waits on a big clean-up. */
const PURGE_BATCH = 20;

/**
 * Makes sure this visitor has a seeded sandbox. Safe to call on every request:
 * after the first call it is a single primary-key lookup. Returns the firm
 * name the visitor typed, or null while the demo shows the fictional firm.
 */
export async function ensureSandbox(db: Db, sandboxId: string, now = new Date()): Promise<string | null> {
  const [existing] = await db.select({ firmName: sandboxes.firmName }).from(sandboxes).where(eq(sandboxes.id, sandboxId));
  if (existing) return existing.firmName;

  // Insert and seed in one transaction. A concurrent request for the same new
  // visitor waits on the insert, then sees the finished sandbox and skips seeding.
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(sandboxes).values({ id: sandboxId, createdAt: now }).onConflictDoNothing().returning();
    // The sample data is always written under the fictional firm's name.
    if (inserted.length) await seedSandbox({ db: tx as unknown as Db, sandboxId, now, firm: DEMO_FIRM });
  });

  await purge(db, sandboxId, now);
  return null;
}

/** The firm name a visitor typed, without creating anything. Null for the fictional firm or an unknown sandbox. */
export async function firmNameOf(db: Db, sandboxId: string): Promise<string | null> {
  const [row] = await db.select({ firmName: sandboxes.firmName }).from(sandboxes).where(eq(sandboxes.id, sandboxId));
  return row?.firmName ?? null;
}

/** Stores the visitor's firm name, or null to go back to the fictional firm. */
export async function setFirmName(db: Db, sandboxId: string, firmName: string | null): Promise<void> {
  await db.update(sandboxes).set({ firmName }).where(eq(sandboxes.id, sandboxId));
}

/**
 * What a device compares to know whether the sandbox changed since it last
 * looked. It includes the creation time, so a reset reads as a change too.
 */
export type SandboxStamp = string;

const stampOf = (row: { createdAt: Date; revision: number }): SandboxStamp => `${row.createdAt.getTime()}.${row.revision}`;

/** Records that the visitor changed something. Returns the new stamp, or null if the sandbox is gone. */
export async function touchSandbox(db: Db, sandboxId: string): Promise<SandboxStamp | null> {
  const [row] = await db
    .update(sandboxes)
    .set({ revision: sql`${sandboxes.revision} + 1` })
    .where(eq(sandboxes.id, sandboxId))
    .returning({ createdAt: sandboxes.createdAt, revision: sandboxes.revision });
  return row ? stampOf(row) : null;
}

/** The current stamp, read with one primary-key lookup. Null if the sandbox does not exist. */
export async function sandboxStamp(db: Db, sandboxId: string): Promise<SandboxStamp | null> {
  const [row] = await db.select({ createdAt: sandboxes.createdAt, revision: sandboxes.revision }).from(sandboxes).where(eq(sandboxes.id, sandboxId));
  return row ? stampOf(row) : null;
}

/**
 * Housekeeping piggybacks on new visitors, so no scheduled job is needed.
 * Removes sandboxes past their lifetime, then enforces the cap, which bounds
 * the size of the database however many visitors (or scripts) turn up.
 */
async function purge(db: Db, keep: string, now: Date): Promise<void> {
  const remove = async (ids: { id: string }[]) => {
    const others = ids.map((row) => row.id).filter((id) => id !== keep);
    if (others.length) await db.delete(sandboxes).where(inArray(sandboxes.id, others));
  };

  const expired = new Date(now.getTime() - SANDBOX_LIFETIME_MS);
  await remove(await db.select({ id: sandboxes.id }).from(sandboxes).where(lt(sandboxes.createdAt, expired)).orderBy(asc(sandboxes.createdAt)).limit(PURGE_BATCH));

  const [{ total }] = await db.select({ total: count() }).from(sandboxes);
  if (total > MAX_SANDBOXES) {
    await remove(await db.select({ id: sandboxes.id }).from(sandboxes).orderBy(asc(sandboxes.createdAt)).limit(Math.min(total - MAX_SANDBOXES, PURGE_BATCH)));
  }
}

export async function resetSandbox(db: Db, sandboxId: string, now = new Date()): Promise<void> {
  await db.delete(sandboxes).where(eq(sandboxes.id, sandboxId));
  await ensureSandbox(db, sandboxId, now);
}
