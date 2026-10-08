/**
 * タイムゾーンを意識した日付ユーティリティ。
 *
 * Python版はPCのローカル時刻(datetime.now())を基準にしていたが、
 * Amplify(Lambda)の実行環境はUTCなので、APP_TIMEZONE を基準に「今日」を求める。
 *
 * 暦日は「UTC 0時の Date」で表し、加減算は setUTCDate で行う(DSTの影響を受けない)。
 */

export type CalDate = Date; // UTC 00:00 の Date を「暦日」として扱う

export function todayIn(timeZone: string, now = new Date()): CalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "2026-10-08"
  return parseIsoDate(parts)!;
}

export function parseIsoDate(value: string): CalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // 2026-02-31 のような存在しない日付を弾く
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

export function makeDate(year: number, month: number, day: number): CalDate | null {
  return parseIsoDate(`${year}-${pad(month)}-${pad(day)}`);
}

export function addDays(d: CalDate, days: number): CalDate {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

export const diffDays = (a: CalDate, b: CalDate) => Math.round((a.getTime() - b.getTime()) / 86_400_000);

/** Python の date.weekday() と同じ (月=0 … 日=6) */
export const weekday = (d: CalDate) => (d.getUTCDay() + 6) % 7;

export const pad = (n: number) => String(n).padStart(2, "0");

export const ymd = (d: CalDate) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const ym = (d: CalDate) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
export const md = (d: CalDate) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
export const weekdayShort = (d: CalDate) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];

/** 指定タイムゾーンでのUTCオフセット ("+09:00" など) */
export function utcOffset(d: CalDate, timeZone: string): string {
  // その暦日の正午時点のオフセットを使う(0時ちょうどのDST切替を避ける)
  const probe = new Date(d.getTime() + 12 * 3_600_000);
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT+09:00" / "GMT"
  const m = /GMT([+-]\d{2}:\d{2})/.exec(name ?? "");
  return m ? m[1] : "+00:00";
}

/** 暦日の 0:00 を、タイムゾーンのオフセット付き ISO 8601 文字列にする */
export const startOfDayIso = (d: CalDate, timeZone: string) => `${ymd(d)}T00:00:00${utcOffset(d, timeZone)}`;
