import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { ensureSandbox } from "@/db/sandbox";
import { SANDBOX_COOKIE } from "./cookie";
import type { Ctx } from "./workflow";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id in the visitor's cookie. The proxy sets it, so it is only missing if cookies are blocked. */
export async function sandboxIdFromCookie(): Promise<string> {
  const id = (await cookies()).get(SANDBOX_COOKIE)?.value;
  if (!id || !UUID.test(id)) throw new Error("This demo needs cookies switched on to keep your sample data separate from other visitors.");
  return id;
}

/** Database, sandbox and clock for the current request. Seeds the sandbox on a visitor's first request. */
export async function getCtx(): Promise<Ctx> {
  const sandboxId = await sandboxIdFromCookie();
  const db = await getDb();
  const now = new Date();
  await ensureSandbox(db, sandboxId, now);
  return { db, sandboxId, now };
}
