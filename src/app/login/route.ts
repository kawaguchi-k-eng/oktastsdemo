import { NextResponse, type NextRequest } from "next/server";
import { callbackUrl } from "@/lib/base-url";
import { authorizeUrl, newLoginTx } from "@/lib/oidc";
import { LOGIN_TX_COOKIE, cookieOptions, seal } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tx = newLoginTx();
  const res = NextResponse.redirect(await authorizeUrl(tx, callbackUrl(req)));
  // state / nonce / PKCE code_verifier はコールバックまでの短期間だけ暗号化Cookieに保持
  res.cookies.set(LOGIN_TX_COOKIE, await seal(tx, 600), cookieOptions(600));
  return res;
}
