/** Microsoft Graph API経由でOffice 365(Outlook)カレンダーの予定を取得する */

import { startOfDayIso, type CalDate } from "./dates";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

type GraphEvent = {
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  location?: { displayName?: string };
};

/**
 * start <= 予定 < end の範囲でカレンダーの予定を取得する。
 * 範囲は appTimezone の 0:00 (オフセット付き) で指定し、
 * 応答の日時は Prefer ヘッダーの graphTimezone で返させる。繰り返し予定は calendarView が展開する。
 */
export async function fetchEvents(
  accessToken: string,
  start: CalDate,
  end: CalDate,
  appTimezone: string,
  graphTimezone = "UTC",
): Promise<GraphEvent[]> {
  const url = new URL(`${GRAPH_API_BASE}/me/calendarView`);
  url.search = new URLSearchParams({
    startDateTime: startOfDayIso(start, appTimezone),
    endDateTime: startOfDayIso(end, appTimezone),
    $orderby: "start/dateTime",
    $top: "100",
  }).toString();

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: `outlook.timezone="${graphTimezone}"`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Microsoft Graph error: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { value?: GraphEvent[] }).value ?? [];
}

/** '2026-09-10T09:00:00.0000000' -> '09/10 09:00' */
function fmtDt(value: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  return m ? `${m[1]}/${m[2]} ${m[3]}:${m[4]}` : value;
}

export function formatEventsForPrompt(events: GraphEvent[]): string {
  if (!events.length) return "対象期間に予定はありません。";

  return events
    .map((ev) => {
      const start = fmtDt(ev.start?.dateTime ?? "");
      const end = fmtDt(ev.end?.dateTime ?? "");
      const subject = ev.subject ?? "(件名なし)";
      const location = ev.location?.displayName ?? "";
      return `- ${start}〜${end} : ${subject}` + (location ? ` @ ${location}` : "");
    })
    .join("\n");
}
