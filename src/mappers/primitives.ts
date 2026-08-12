/** 변환 원시 유틸. CGV 는 숫자/시각/불린을 모두 문자열로 준다. */

/** "1410" → "14:10". 형식이 다르면 원본을 그대로 돌려준다. */
export function toClockTime(hhmm: string): string {
  if (!/^\d{3,4}$/.test(hhmm)) return hhmm;
  const padded = hhmm.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

/** "184" → 184. 숫자가 아니면 fallback. */
export function toNumber(value: string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** "Y" → true (대소문자 무시) */
export function isYes(value: string | null | undefined): boolean {
  return value?.trim().toUpperCase() === "Y";
}

/** YYYYMMDD 로 오늘 날짜. CGV 는 KST 기준이므로 Asia/Seoul 로 고정한다. */
export function todayInSeoul(): string {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return formatted.replaceAll("-", "");
}
