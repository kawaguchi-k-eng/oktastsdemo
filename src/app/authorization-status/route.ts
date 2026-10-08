import { NextResponse } from "next/server";
import { InteractionRequired, getResourceAccessToken } from "@/lib/okta-agent";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * チャット画面からのポーリング用。
 * Microsoftの初回認可がまだなら pending、済んでいれば ready を返す。
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ status: "unauthenticated" }, { status: 401 });

  try {
    await getResourceAccessToken(session.idToken);
  } catch (e) {
    if (e instanceof InteractionRequired) return NextResponse.json({ status: "pending" });
    // デモなので詳細をそのまま返す
    return NextResponse.json({ status: "error", detail: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ status: "ready" });
}
