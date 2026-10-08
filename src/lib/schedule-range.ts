/**
 * チャットの発話から、参照するカレンダーの期間(開始/終了)を決める。
 *
 * - resolveRange : LLMを使わない簡易ルールベース(フォールバック用)
 * - toRange      : LLM(openai.resolvePeriod)が返したJSONを検証して期間に変換
 *
 * 戻り値はいずれも { start, end, label }
 *   - start / end : 暦日 (end は排他的終端)
 *   - label       : ユーザー/LLM向けの期間説明文字列
 */

import { addDays, diffDays, makeDate, md, parseIsoDate, weekday, ym, ymd, type CalDate } from "./dates";

const MAX_SPAN_DAYS = 92;

export type DateRange = { start: CalDate; end: CalDate; label: string };
export type Period = { start_date?: unknown; end_date?: unknown; label?: unknown };

export function toRange(period: Period, message: string, today: CalDate): DateRange {
  const start = parseIsoDate(String(period?.start_date ?? ""));
  let end = parseIsoDate(String(period?.end_date ?? ""));
  if (!start || !end) return resolveRange(message, today);

  if (end <= start) end = addDays(start, 1);
  if (diffDays(end, start) > MAX_SPAN_DAYS) end = addDays(start, MAX_SPAN_DAYS);

  let label = String(period.label ?? "").trim();
  if (!label) {
    const last = addDays(end, -1);
    label = ymd(last) === ymd(start) ? ymd(start) : `${ymd(start)}〜${ymd(last)}`;
  }
  return { start, end, label };
}

function firstOfNextMonth(d: CalDate): CalDate {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function resolveRange(message: string, today: CalDate): DateRange {
  const msg = message || "";
  const span = (start: CalDate, end: CalDate, label: string): DateRange => ({ start, end, label });

  // 明後日
  if (msg.includes("明後日") || msg.includes("あさって")) {
    const d = addDays(today, 2);
    return span(d, addDays(d, 1), `明後日 (${ymd(d)})`);
  }

  // 明日
  if (msg.includes("明日") || msg.includes("あした") || msg.includes("翌日")) {
    const d = addDays(today, 1);
    return span(d, addDays(d, 1), `明日 (${ymd(d)})`);
  }

  // 週末 / 今週末(直近の土日)
  if (msg.includes("週末")) {
    const sat = addDays(today, (5 - weekday(today) + 7) % 7);
    return span(sat, addDays(sat, 2), `今週末 (${md(sat)}〜${md(addDays(sat, 1))})`);
  }

  // 来週(次の月曜〜日曜)
  if (msg.includes("来週") || msg.includes("翌週")) {
    const mon = addDays(today, 7 - weekday(today));
    return span(mon, addDays(mon, 7), `来週 (${ymd(mon)}〜${ymd(addDays(mon, 6))})`);
  }

  // 今週(今週の月曜〜日曜)
  if (msg.includes("今週") || msg.includes("週の予定")) {
    const mon = addDays(today, -weekday(today));
    return span(mon, addDays(mon, 7), `今週 (${ymd(mon)}〜${ymd(addDays(mon, 6))})`);
  }

  // 来月
  if (msg.includes("来月")) {
    const first = firstOfNextMonth(today);
    return span(first, firstOfNextMonth(first), `来月 (${ym(first)})`);
  }

  // 今月
  if (msg.includes("今月")) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    return span(first, firstOfNextMonth(first), `今月 (${ym(first)})`);
  }

  // 「N日間」「今後N日」
  let m = /(\d+)\s*日間|今後\s*(\d+)\s*日|これから\s*(\d+)\s*日/.exec(msg);
  if (m) {
    let n = parseInt(m[1] ?? m[2] ?? m[3], 10);
    n = Math.max(1, Math.min(n, 60));
    return span(today, addDays(today, n), `今後${n}日間 (${ymd(today)}〜${ymd(addDays(today, n - 1))})`);
  }

  // 「M月D日」
  m = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(msg);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = today.getUTCFullYear() + (month < today.getUTCMonth() + 1 ? 1 : 0);
    const d = makeDate(year, month, day);
    if (d) return span(d, addDays(d, 1), ymd(d));
  }

  // 既定: 本日
  return span(today, addDays(today, 1), `本日 (${ymd(today)})`);
}
