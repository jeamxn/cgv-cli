/**
 * 좌석 조회 · 선점 · 해제.
 *
 * 주의: hold() / release() 는 CGV 운영 데이터에 실제로 영향을 준다.
 * hold() 는 좌석을 잠그고, 방치하면 다른 사람이 예매할 수 없다. 반드시 release() 하거나
 * 만료를 기다려야 한다.
 */
import { RTCTL_SCOPE_WEB } from "../core/config.ts";
import type { HttpTransport } from "../core/transport.ts";
import type { AuthResource } from "./auth.ts";
import type {
  RawSeatData,
  RawSeatHoldItem,
  RawSeatHoldResult,
  RawSeatPriceRequest,
} from "../types/raw-booking.ts";

/** 회차를 특정하는 키. */
export interface ShowKey {
  readonly movieId: string;
  readonly theaterId: string;
  /** YYYYMMDD */
  readonly date: string;
  /** 상영관 번호 */
  readonly screenId: string;
  /** 회차 */
  readonly sequence: string;
}

/** 선점 대상 좌석. seatLocNo 만 알면 나머지는 파싱으로 채울 수 있다. */
export interface SeatRef {
  readonly seatLocNo: string;
  readonly row: string;
  readonly number: string;
  readonly sbordNo: string;
  readonly seatAreaNo: string;
  readonly szoneNo: string;
}

export interface SeatHold {
  /** 발권번호. 결제 단계에서 이 값을 쓴다. */
  readonly movAtktNo: string;
  /** 선점 만료 시각 문자열 (YYYYMMDDHHmmss). 확인 실패 시 null */
  readonly expiresAt: string | null;
  readonly seats: readonly SeatRef[];
  readonly show: ShowKey;
  /** 스키마 미확정 필드를 잃지 않도록 원본을 보관한다. */
  readonly raw: RawSeatHoldResult;
}

/**
 * seatLocNo 14자리 = sbordNo(3) + seatAreaNo(3) + 행(4) + 열(4)
 * 실측: "00100100170021" → sbord 001, area 001, K행 8번
 * 행/열 숫자와 표시용 행문자(K)의 대응은 확인되지 않아, 행문자는 호출자가 넘겨야 한다.
 */
export function parseSeatLocNo(
  seatLocNo: string,
  row: string,
  number: string,
  szoneNo = "01001",
): SeatRef {
  if (!/^\d{14}$/.test(seatLocNo)) {
    throw new Error(`seatLocNo 는 숫자 14자리여야 합니다: ${seatLocNo}`);
  }
  return {
    seatLocNo,
    row,
    number,
    sbordNo: seatLocNo.slice(0, 3),
    seatAreaNo: seatLocNo.slice(3, 6),
    szoneNo,
  };
}

function toHoldItems(seats: readonly SeatRef[]): RawSeatHoldItem[] {
  return seats.map((seat) => ({
    seatRowNm: seat.row,
    seatNo: seat.number,
    seatLocNo: seat.seatLocNo,
    sbordNo: seat.sbordNo,
    seatAreaNo: seat.seatAreaNo,
    szoneNo: seat.szoneNo,
  }));
}

export class SeatsResource {
  private readonly http: HttpTransport;
  private readonly auth: AuthResource;

  constructor(http: HttpTransport, auth: AuthResource) {
    this.http = http;
    this.auth = auth;
  }

  /**
   * 좌석 배치도 원본. 응답 스키마를 확정하지 못해 가공 없이 그대로 돌려준다.
   * seatAreaNo 를 주면 특정 구역만 조회한다.
   */
  async layout(show: ShowKey, seatAreaNo?: string): Promise<RawSeatData> {
    const session = this.auth.require();
    return this.http.get<RawSeatData>("/booking/searchIfSeatData", {
      siteNo: show.theaterId,
      scnYmd: show.date,
      scnsNo: show.screenId,
      scnSseq: show.sequence,
      seatAreaNo,
      custNo: session.custNo,
    });
  }

  /** 예매 가능 여부 사전 확인. 부수효과 없음. */
  async precheck(show: ShowKey): Promise<unknown> {
    const session = this.auth.require();
    return this.http.get("/booking/searchAtktBefChkPay", {
      siteNo: show.theaterId,
      scnYmd: show.date,
      scnsNo: show.screenId,
      scnSseq: show.sequence,
      custNo: session.custNo,
      dblfrRpsntYn: "N",
      cxprdYn: "N",
    });
  }

  /** 좌석 가격 조회. 부수효과 없음. */
  async price(show: ShowKey, seats: readonly SeatRef[]): Promise<unknown> {
    const body: RawSeatPriceRequest = {
      coCd: "A420",
      siteNo: show.theaterId,
      scnsNo: show.screenId,
      scnYmd: show.date,
      scnSseq: show.sequence,
      movNo: show.movieId,
      rtctlScopCd: RTCTL_SCOPE_WEB,
      prcrulDivCd: "01",
      sachlTypCd: "01",
      prodBnduList: [{ prodBnduCd: "01", prodBnduQty: seats.length }],
      seatList: seats.map((seat) => ({
        seatLocNo: seat.seatLocNo,
        szoneKindCd: "01",
        stkndCd: "01",
        seatSalfrmCd: "01",
        prodBnduCd: "01",
      })),
      zoneGroupYn: "N",
    };
    return this.http.post("/booking/searchMovAtktSeatPrcList", body);
  }

  /**
   * ⚠️ 좌석을 실제로 잠근다. 다른 사람이 그 좌석을 예매할 수 없게 된다.
   * 사용 후 반드시 release() 하거나 만료를 기다려야 한다.
   */
  async hold(show: ShowKey, seats: readonly SeatRef[]): Promise<SeatHold> {
    if (seats.length === 0) throw new Error("선점할 좌석이 없습니다.");
    const session = this.auth.require();

    const raw = await this.http.post<RawSeatHoldResult>("/content/seatTemp/seatTempPrmp", {
      coCd: "A420",
      bymd: "",
      mbltNo: "",
      siteNo: show.theaterId,
      scnYmd: show.date,
      scnsNo: show.screenId,
      scnSseq: show.sequence,
      movAtktNo: "",
      custNo: session.custNo,
      cusgdCd: "01",
      nmbrCrtfNo: "",
      sachlCd: "10",
      atktChnlCd: "01",
      sachlTypCd: "01",
      rtctlScopCd: RTCTL_SCOPE_WEB,
      seatPrmpDataList: toHoldItems(seats),
    });

    const movAtktNo = typeof raw?.movAtktNo === "string" ? raw.movAtktNo : "";
    if (movAtktNo === "") {
      throw new Error(
        `좌석 선점 응답에서 발권번호(movAtktNo)를 찾지 못했습니다. 응답: ${JSON.stringify(raw).slice(0, 300)}`,
      );
    }

    return {
      movAtktNo,
      expiresAt: typeof raw.szoneExpTm === "string" ? raw.szoneExpTm : null,
      seats,
      show,
      raw,
    };
  }

  /** 선점 해제. 실패하면 만료(보통 10분)까지 좌석이 잠긴 채로 남는다. */
  async release(hold: SeatHold): Promise<void> {
    const session = this.auth.require();
    await this.http.post("/content/seatTemp/seatTempPrmpCncl", {
      coCd: "A420",
      movAtktNo: hold.movAtktNo,
      sachlTypCd: "01",
      rtctlScopCd: RTCTL_SCOPE_WEB,
      custNo: session.custNo,
      seatPrmpDataList: toHoldItems(hold.seats),
    });
  }
}
