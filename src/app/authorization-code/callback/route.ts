import { NextResponse, type NextRequest } from "next/server";
import { baseUrl, callbackUrl } from "@/lib/base-url";
import { exchangeCode } from "@/lib/oidc";
import { LOGIN_TX_COOKIE, SESSION_COOKIE, cookieOptions, seal, unseal, type LoginTx } from "@/lib/session";

export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 8 * 60 * 60;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    return new NextResponse(`ログインに失敗しました: ${error} ${params.get("error_description") ?? ""}`, {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const tx = await unseal<LoginTx>(req.cookies.get(LOGIN_TX_COOKIE)?.value);
  const code = params.get("code");
  if (!tx || !code || params.get("state") !== tx.state) {
    return new NextResponse("ログイン状態が不正です。もう一度ログインしてください。", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const { idToken, user } = await exchangeCode(code, tx, callbackUrl(req));
    const res = NextResponse.redirect(`${baseUrl(req)}/`);
    res.cookies.set(SESSION_COOKIE, await seal({ idToken, user }, SESSION_MAX_AGE), cookieOptions(SESSION_MAX_AGE));
    res.cookies.delete(LOGIN_TX_COOKIE);
    return res;
  } catch (e) {
    return new NextResponse(`ログイン処理でエラーが発生しました: ${(e as Error).message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
