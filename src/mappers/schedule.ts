import type { ScreenSchedule, ScreeningDate, Showtime } from "../types/domain.ts";
import type { RawScreeningDay, RawShowtime } from "../types/raw.ts";
import { isYes, toClockTime, toNumber } from "./primitives.ts";

export function toScreeningDate(raw: RawScreeningDay): ScreeningDate {
  return { date: raw.scnYmd, isHoliday: isYes(raw.hldyYn) };
}

export function toShowtime(raw: RawShowtime): Showtime {
  const remainingSeats = toNumber(raw.frSeatCnt);
  const sellableSeats = toNumber(raw.cpSeatCnt);
  const underControl = isYes(raw.cntlYn);

  return {
    movieId: raw.movNo,
    movieTitle: raw.movNm,
    theaterId: raw.siteNo,
    theaterName: raw.siteNm,
    screenId: raw.scnsNo,
    screenName: raw.scnsNm,
    screenDisplayName: raw.expoScnsNm,
    sequence: raw.scnSseq,
    date: raw.scnYmd,
    startTime: toClockTime(raw.scnsrtTm),
    endTime: toClockTime(raw.scnendTm),
    actualStartTime: toClockTime(raw.rlMovStartTm),
    salesEndTime: toClockTime(raw.salEndTm),
    format: raw.movkndDsplNm,
    rating: raw.cratgClsNm,
    remainingSeats,
    sellableSeats,
    totalSeats: toNumber(raw.stcnt),
    occupancyRate: sellableSeats > 0 ? (sellableSeats - remainingSeats) / sellableSeats : null,
    bookable: !underControl && remainingSeats > 0,
  };
}

/**
 * 회차 목록을 상영관(scnsNo) 단위로 묶는다.
 * 상영관은 번호 오름차순, 각 상영관의 회차는 시작시각 오름차순.
 */
export function groupByScreen(showtimes: readonly Showtime[]): ScreenSchedule[] {
  const buckets = new Map<string, Showtime[]>();
  for (const showtime of showtimes) {
    const bucket = buckets.get(showtime.screenId);
    if (bucket === undefined) buckets.set(showtime.screenId, [showtime]);
    else bucket.push(showtime);
  }

  const schedules: ScreenSchedule[] = [];
  for (const [screenId, group] of buckets) {
    const sorted = [...group].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const first = sorted[0];
    if (first === undefined) continue;

    schedules.push({
      theaterName: first.theaterName,
      screenId,
      screenName: first.screenName,
      screenDisplayName: first.screenDisplayName,
      totalSeats: first.totalSeats,
      showtimes: sorted,
      remainingSeatsTotal: sorted.reduce((sum, item) => sum + item.remainingSeats, 0),
    });
  }

  return schedules.sort((a, b) => a.screenId.localeCompare(b.screenId));
}
