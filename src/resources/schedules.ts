/** 플로우 4단계: 상영관별 회차 + 잔여좌석. */
import { RTCTL_SCOPE_WEB } from "../core/config.ts";
import type { HttpTransport } from "../core/transport.ts";
import { isYes } from "../mappers/primitives.ts";
import { groupByScreen, toShowtime } from "../mappers/schedule.ts";
import type { ScheduleQuery, ScreenSchedule, Showtime, ShowtimeQuery } from "../types/domain.ts";
import type { RawRealtimeControl, RawShowtime } from "../types/raw.ts";

export class SchedulesResource {
  private readonly http: HttpTransport;

  constructor(http: HttpTransport) {
    this.http = http;
  }

  /**
   * 평면 회차 목록. 잔여좌석(frSeatCnt)이 이 응답에 포함되어 있어
   * 좌석 조회를 위한 추가 호출이 필요 없다.
   */
  async list(query: ScheduleQuery): Promise<Showtime[]> {
    const raw = await this.http.get<readonly RawShowtime[]>("/booking/searchSchByMov", {
      siteNo: query.theaterId,
      scnYmd: query.date,
      movNo: query.movieId,
      rtctlScopCd: RTCTL_SCOPE_WEB,
    });
    return raw.map(toShowtime);
  }

  /** 상영관 단위로 묶은 형태. CGV 예매 화면과 같은 구조. */
  async byScreen(query: ScheduleQuery): Promise<ScreenSchedule[]> {
    return groupByScreen(await this.list(query));
  }

  /**
   * 특정 회차가 실시간 예매 제어중인지 확인한다.
   * 좌석 선택으로 넘어가기 직전 CGV 가 호출하는 검사와 동일하다.
   */
  async isBookable(query: ShowtimeQuery): Promise<boolean> {
    const raw = await this.http.get<RawRealtimeControl>("/common/bznsCom/mov/searchRtktCntlYn", {
      siteNo: query.theaterId,
      scnYmd: query.date,
      scnsNo: query.screenId,
      scnSseq: query.sequence,
      rtctlScopCd: RTCTL_SCOPE_WEB,
    });
    return !isYes(raw.rtktCntlYn);
  }
}
