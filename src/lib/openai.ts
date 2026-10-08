/** OpenAI APIを使って、取得したOffice 365(Outlook)カレンダーの予定について応答する */

import OpenAI from "openai";
import { openaiModel, required } from "./config";
import { weekdayShort, ymd, type CalDate } from "./dates";
import type { Period } from "./schedule-range";

export type ChatTurn = { role: "user" | "assistant"; content: string };

const PERIOD_SYSTEM =
  "あなたはカレンダー参照の前処理を行うコンポーネントです。" +
  "ユーザーの発話と直近の会話履歴から、Outlookカレンダーを参照すべき日付範囲を判定してください。\n" +
  "出力は次のJSONオブジェクトのみ(前後の説明文なし):\n" +
  '{"start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "label": "日本語の期間説明"}\n' +
  "ルール:\n" +
  "- end_date は範囲に含めない排他的終端(例: 1日だけなら翌日を入れる)\n" +
  "- 「今週」は月曜〜日曜、「週末」は土日、「今月」は月初〜月末\n" +
  "- 相対表現(来週・再来週・明後日など)は基準日から計算する\n" +
  "- 期間の指定が読み取れない場合は基準日の1日分にする\n" +
  "- label は「今週 (2026-09-08〜2026-09-14)」のように人間向けに簡潔に";

const SYSTEM_PROMPT =
  "あなたは優秀な秘書AIエージェントです。" +
  "ユーザーのOutlookカレンダーから取得した予定一覧を、対象期間つきでコンテキストとして渡します。" +
  "その内容だけを根拠に、ユーザーの質問へ簡潔で分かりやすい日本語で答えてください。" +
  "予定の要約を求められたら、空き時間や詰まっている時間帯にも一言触れてください。" +
  "渡された期間の外や、カレンダーに無い情報を尋ねられた場合は、その旨を正直に伝えてください。";

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ apiKey: required("OPENAI_API_KEY") }));

/**
 * 発話+会話履歴から参照期間を判定し、{start_date, end_date, label} を返す。
 * 呼び出し側で日付の妥当性チェック(schedule-range.toRange)を行うこと。
 */
export async function resolvePeriod(message: string, history: ChatTurn[], today: CalDate): Promise<Period> {
  const response = await openai().chat.completions.create({
    model: openaiModel(),
    messages: [
      { role: "system", content: PERIOD_SYSTEM },
      { role: "system", content: `基準日(今日): ${ymd(today)} (${weekdayShort(today)})` },
      ...history.slice(-4),
      { role: "user", content: message },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content ?? "{}") as Period;
}

/** 会話履歴と予定テキストから応答を生成する */
export async function chatReply(eventsText: string, history: ChatTurn[], periodLabel?: string): Promise<string> {
  const header = periodLabel ? `対象期間: ${periodLabel}\n` : "";
  const response = await openai().chat.completions.create({
    model: openaiModel(),
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `${header}予定一覧:\n${eventsText}` },
      ...history,
    ],
  });
  return response.choices[0].message.content ?? "";
}
