import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { ensureSandbox, firmNameOf } from "@/db/sandbox";
import { DEMO_FIRM, firmFor, type Firm } from "@/lib/intake";
import { SANDBOX_COOKIE } from "./cookie";
import type { Ctx } from "./workflow";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id in the visitor's cookie. The proxy sets it, so it is only missing if cookies are blocked. */
export async function sandboxIdFromCookie(): Promise<string> {
  const id = (await cookies()).get(SANDBOX_COOKIE)?.value;
  if (!id || !UUID.test(id)) throw new Error("This demo needs cookies switched on to keep your sample data separate from other visitors.");
  return id;
}

/** Database, sandbox, clock and firm name for the current request. Seeds the sandbox on a visitor's first request. */
export async function getCtx(): Promise<Ctx> {
  const sandboxId = await sandboxIdFromCookie();
  const db = await getDb();
  const now = new Date();
  const firm = firmFor(await ensureSandbox(db, sandboxId, now));
  return { db, sandboxId, now, firm };
}

/**
 * The firm to show in the parts of the page drawn outside a screen (the demo
 * bar, the page title). Unlike getCtx it never creates a sandbox, so a visitor
 * without a cookie, or a crawler, costs nothing.
 */
export async function currentFirm(): Promise<Firm> {
  const id = (await cookies()).get(SANDBOX_COOKIE)?.value;
  if (!id || !UUID.test(id)) return DEMO_FIRM;
  return firmFor(await firmNameOf(await getDb(), id));
}
