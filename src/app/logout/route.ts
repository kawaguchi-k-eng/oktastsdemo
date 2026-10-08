import { NextResponse, type NextRequest } from "next/server";
import { baseUrl } from "@/lib/base-url";
import { logoutUrl } from "@/lib/oidc";
import { SESSION_COOKIE, unseal, type SessionData } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await unseal<SessionData>(req.cookies.get(SESSION_COOKIE)?.value);
  const home = `${baseUrl(req)}/`;
  const res = NextResponse.redirect(session?.idToken ? logoutUrl(session.idToken, home) : home);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
