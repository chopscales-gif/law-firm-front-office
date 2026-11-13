import { NextResponse, type NextRequest } from "next/server";
import { SANDBOX_COOKIE } from "@/server/cookie";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Gives every visitor a private sandbox id. The id is also written onto the
 * incoming request, so the very first page render can already read it.
 */
export function proxy(request: NextRequest) {
  // A cookie that is not one of our ids (edited, or left over from something else) is replaced.
  if (UUID.test(request.cookies.get(SANDBOX_COOKIE)?.value ?? "")) return NextResponse.next();

  const id = crypto.randomUUID();
  request.cookies.set(SANDBOX_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(SANDBOX_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 48, // sandboxes are purged after 48 hours
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
