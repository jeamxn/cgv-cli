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
  RawSeat,
  RawSeatData,
  RawSeatHoldItem,
  RawSeatHoldResult,
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

/**
 * 선점 대상 좌석.
 *
 * 값은 전부 배치도 응답에서 읽는다. 추측하지 않는다 —
 * IMAX 는 존이 둘(szoneKindCd 01/02)이고 4DX 는 PRIME석(stkndCd 12)이 섞여 있어
 * 일반관 기준으로 넘겨짚으면 가격과 좌석이 어긋난다.
 */
export interface SeatRef {
  readonly seatLocNo: string;
  readonly row: string;
  readonly number: string;
  readonly sbordNo: string;
  readonly seatAreaNo: string;
  readonly szoneNo: string;
  readonly szoneKindCd: string;
  readonly stkndCd: string;
  readonly seatSalfrmCd: string;
  /** 표시용 좌석 종류명 (일반석 / PRIME석 등) */
  readonly stkndNm: string;
}

/** 사용자가 지정한 좌석. 좌석명만 주거나 seatLocNo 까지 줄 수 있다. */
export interface SeatSpec {
  readonly row: string;
  readonly number: string;
  /** 있으면 이 값으로 배치도에서 찾는다. 없으면 행+번호로 찾는다. */
  readonly seatLocNo?: string;
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

/** 배치도 응답에서 좌석 배열만 꺼낸다. 구역이 여러 개면 전부 합친다. */
function flattenSeats(layout: unknown): RawSeat[] {
  const items = (layout as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const seats = (item as { seats?: unknown[] })?.seats;
    return Array.isArray(seats) ? (seats as RawSeat[]) : [];
  });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function toSeatRef(raw: RawSeat): SeatRef {
  return {
    seatLocNo: text(raw.seatLocNo),
    row: text(raw.seatRowNm),
    number: text(raw.seatNo),
    sbordNo: text(raw.sbordNo),
    seatAreaNo: text(raw.seatAreaNo),
    szoneNo: text(raw.szoneNo),
    szoneKindCd: text(raw.szoneKindCd),
    stkndCd: text(raw.stkndCd),
    seatSalfrmCd: text(raw.seatSalfrmCd),
    stkndNm: text(raw.stkndNm, "일반석"),
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

  /**
   * 사용자가 지정한 좌석을 배치도와 대조해 실제 속성을 채운다. 부수효과 없음.
   * 이미 팔린 좌석이면 선점 전에 여기서 막는다.
   */
  async resolve(
    show: ShowKey,
    specs: readonly SeatSpec[],
    /** 해제(release)처럼 이미 잡힌 좌석을 다뤄야 할 때만 켠다. */
    options: { readonly includeSold?: boolean } = {},
  ): Promise<SeatRef[]> {
    if (specs.length === 0) throw new Error("좌석을 지정하세요.");

    const seats = flattenSeats(await this.layout(show));
    if (seats.length === 0) {
      throw new Error("좌석 배치도를 읽지 못했습니다. 상영관·회차를 확인하세요.");
    }

    const picked: SeatRef[] = [];
    for (const spec of specs) {
      const label = `${spec.row}${spec.number}`;
      const matches =
        spec.seatLocNo === undefined
          ? seats.filter(
              (seat) =>
                text(seat.seatRowNm).toUpperCase() === spec.row && text(seat.seatNo) === spec.number,
            )
          : seats.filter((seat) => text(seat.seatLocNo) === spec.seatLocNo);

      const found = matches[0];
      if (found === undefined) {
        throw new Error(`배치도에 없는 좌석입니다: ${label}`);
      }
      // 같은 좌석명이 구역마다 따로 있는 상영관이 있다(SCREENX 의 PRIVATE BOX 등).
      // 어느 쪽인지 모른 채 좌석을 잠그면 안 되므로 여기서 멈춘다.
      if (matches.length > 1) {
        const candidates = matches
          .map(
            (seat) =>
              `    ${label}@${text(seat.seatLocNo)}  ${text(seat.stkndNm, "일반석")}` +
              `${text((seat as { movAtktNo?: unknown }).movAtktNo) === "" ? "" : " (판매됨)"}`,
          )
          .join("\n");
        throw new Error(
          `'${label}' 이 이 상영관에 ${matches.length}개 있습니다. seatLocNo 까지 지정하세요:\n${candidates}`,
        );
      }
      if (
        options.includeSold !== true &&
        text((found as { movAtktNo?: unknown }).movAtktNo) !== ""
      ) {
        throw new Error(`이미 판매된 좌석입니다: ${label}`);
      }
      const ref = toSeatRef(found);
      if (picked.some((seat) => seat.seatLocNo === ref.seatLocNo)) {
        throw new Error(`좌석이 중복 지정됐습니다: ${label}`);
      }
      picked.push(ref);
    }
    return picked;
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
