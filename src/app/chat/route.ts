import { NextResponse, type NextRequest } from "next/server";
import { appTimezone, graphTimezone } from "@/lib/config";
import { todayIn } from "@/lib/dates";
import { fetchEvents, formatEventsForPrompt } from "@/lib/ms-calendar";
import { InteractionRequired, getResourceAccessToken } from "@/lib/okta-agent";
import { chatReply, resolvePeriod, type ChatTurn } from "@/lib/openai";
import { resolveRange, toRange, type DateRange } from "@/lib/schedule-range";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_HISTORY = 20;
const MAX_CONTENT = 4000;

/** ブラウザから送られてきた会話履歴を検証して整形する */
function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is ChatTurn =>
        !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string",
    )
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_CONTENT) }))
    .slice(-MAX_HISTORY);
}

/**
 * チャットボックスからのメッセージを受け取り、AI Agent経由で予定を取得して応答する。
 *
 * リクエスト(JSON): {"message": "...", "history": [{role, content}, ...]}
 * 戻り値(JSON):
 *   - 通常:            {"reply": "...", "events_text": "...", "period": "..."}
 *   - 初回認可が必要:  {"reply": "...", "needs_authorization": true, "interaction_uri": "..."}
 *   - 未ログイン:      401 {"reply": "...", "need_login": true}
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ reply: "先にOktaでログインしてください。", need_login: true }, { status: 401 });
  }

  const data = (await req.json().catch(() => ({}))) as { message?: unknown; history?: unknown };
  const message = typeof data.message === "string" ? data.message.trim().slice(0, MAX_CONTENT) : "";
  if (!message) return NextResponse.json({ reply: "メッセージを入力してください。" }, { status: 400 });

  let accessToken: string;
  try {
    accessToken = await getResourceAccessToken(session.idToken);
  } catch (e) {
    if (e instanceof InteractionRequired) {
      return NextResponse.json({
        reply:
          "Office 365 カレンダーへのアクセス許可が必要です。" +
          "下のリンクからMicrosoftの認可を完了してください。" +
          "完了後、この質問に自動で回答します。",
        needs_authorization: true,
        interaction_uri: e.interactionUri,
      });
    }
    return NextResponse.json({ reply: `トークン取得でエラーが発生しました: ${(e as Error).message}` }, { status: 502 });
  }

  const history = sanitizeHistory(data.history);
  const tz = appTimezone();
  const today = todayIn(tz);

  // 対象期間はLLMに判定させる(失敗時はルールベースにフォールバック)
  let range: DateRange;
  try {
    range = toRange(await resolvePeriod(message, history, today), message, today);
  } catch {
    range = resolveRange(message, today);
  }

  let eventsText: string;
  try {
    const events = await fetchEvents(accessToken, range.start, range.end, tz, graphTimezone());
    eventsText = formatEventsForPrompt(events);
  } catch (e) {
    return NextResponse.json({ reply: `予定の取得でエラーが発生しました: ${(e as Error).message}` }, { status: 502 });
  }

  try {
    const reply = await chatReply(eventsText, [...history, { role: "user", content: message }], range.label);
    return NextResponse.json({ reply, events_text: eventsText, period: range.label });
  } catch (e) {
    return NextResponse.json({ reply: `応答生成でエラーが発生しました: ${(e as Error).message}` }, { status: 502 });
  }
}
