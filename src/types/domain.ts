/**
 * 소비자용 도메인 모델. `frSeatCnt` 같은 원시 필드명을 몰라도 쓸 수 있게 한다.
 * 숫자는 number, 시각은 "HH:MM" 문자열로 정규화한다.
 */

export interface Movie {
  readonly id: string;
  readonly title: string;
  readonly runtimeMinutes: number;
  /** 예매율 (%) */
  readonly bookingRate: number;
  readonly ratingCode: string;
  /** 알려진 코드면 한글 등급명, 아니면 코드 그대로 */
  readonly rating: string;
  readonly posterUrl: string | null;
}

export interface MovieAttribute {
  readonly code: string;
  readonly name: string;
  readonly group: string;
}

export interface Theater {
  readonly id: string;
  readonly name: string;
  readonly operating: boolean;
}

export interface Region {
  readonly code: string;
  readonly name: string;
  /** 이 지역의 상영 스케줄 수. searchRegnList 로 조회했을 때만 채워진다. */
  readonly scheduleCount: number | null;
  readonly theaters: readonly Theater[];
}

export interface ScreeningDate {
  /** YYYYMMDD */
  readonly date: string;
  readonly isHoliday: boolean;
}

export interface Showtime {
  readonly movieId: string;
  readonly movieTitle: string;
  readonly theaterId: string;
  readonly theaterName: string;
  /** 상영관 번호 */
  readonly screenId: string;
  readonly screenName: string;
  /** 노출용 상영관명 (스폰서 표기 포함) */
  readonly screenDisplayName: string;
  /** 회차 */
  readonly sequence: string;
  /** YYYYMMDD */
  readonly date: string;
  /** 상영 시작 "HH:MM" */
  readonly startTime: string;
  /** 상영 종료 "HH:MM" */
  readonly endTime: string;
  /** 광고 후 실제 시작 "HH:MM" */
  readonly actualStartTime: string;
  /** 판매 마감 "HH:MM" */
  readonly salesEndTime: string;
  /** 2D / IMAX 등 */
  readonly format: string;
  readonly rating: string;
  /** 잔여 좌석수 (frSeatCnt) */
  readonly remainingSeats: number;
  /** 판매가능 좌석수 (cpSeatCnt) */
  readonly sellableSeats: number;
  /** 물리 총 좌석수 (stcnt) */
  readonly totalSeats: number;
  /** 점유율 0~1. sellableSeats 기준. 분모가 0이면 null */
  readonly occupancyRate: number | null;
  /** 예매 제어중이 아니고 잔여석이 있으면 true */
  readonly bookable: boolean;
}

/**
 * 상영관 단위로 묶은 회차 목록.
 * 같은 siteNo 응답에 씨네드쉐프 같은 별도 브랜드관이 섞여 오므로
 * 극장명을 상영관 단위로 들고 있어야 정확하다.
 */
export interface ScreenSchedule {
  readonly theaterName: string;
  readonly screenId: string;
  readonly screenName: string;
  readonly screenDisplayName: string;
  readonly totalSeats: number;
  /** 시작시각 오름차순 */
  readonly showtimes: readonly Showtime[];
  /** 이 상영관 전 회차 잔여석 합 */
  readonly remainingSeatsTotal: number;
}

/** searchSchByMov 질의 키 */
export interface ScheduleQuery {
  readonly movieId: string;
  readonly theaterId: string;
  /** YYYYMMDD */
  readonly date: string;
}

/** searchRtktCntlYn 질의 키 */
export interface ShowtimeQuery extends ScheduleQuery {
  readonly screenId: string;
  readonly sequence: string;
}
