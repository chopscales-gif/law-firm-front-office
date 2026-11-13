import { eq, lt } from "drizzle-orm";
import type { Db } from "./client";
import { sandboxes } from "./schema";
import { seedSandbox } from "./seed";

const SANDBOX_LIFETIME_MS = 48 * 3600_000;

/**
 * Makes sure this visitor has a seeded sandbox. Safe to call on every request:
 * after the first call it is a single primary-key lookup.
 */
export async function ensureSandbox(db: Db, sandboxId: string, now = new Date()): Promise<void> {
  const [existing] = await db.select({ id: sandboxes.id }).from(sandboxes).where(eq(sandboxes.id, sandboxId));
  if (existing) return;

  // Insert and seed in one transaction. A concurrent request for the same new
  // visitor waits on the insert, then sees the finished sandbox and skips seeding.
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(sandboxes).values({ id: sandboxId, createdAt: now }).onConflictDoNothing().returning();
    if (inserted.length) await seedSandbox({ db: tx as unknown as Db, sandboxId, now });
  });

  // Housekeeping piggybacks on new visitors, so no scheduled job is needed.
  await db.delete(sandboxes).where(lt(sandboxes.createdAt, new Date(now.getTime() - SANDBOX_LIFETIME_MS)));
}

export async function resetSandbox(db: Db, sandboxId: string, now = new Date()): Promise<void> {
  await db.delete(sandboxes).where(eq(sandboxes.id, sandboxId));
  await ensureSandbox(db, sandboxId, now);
}
