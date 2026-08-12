/**
 * 결제 개시 흐름 조립.
 *
 * 선점된 좌석 → 토스 승인 URL 까지의 순서를 여기서만 안다.
 * 개별 API 호출은 각 리소스가 맡고, 이 클래스는 순서와 데이터 연결만 책임진다.
 */
import { RTCTL_SCOPE_WEB } from "../core/config.ts";
import type { HttpTransport } from "../core/transport.ts";
import type { IdentityResource } from "./identity.ts";
import type { PaymentResource, TossPaymentTicket } from "./payment.ts";
import { buildPaymInfoCont, type ShowMeta } from "./paym-info.ts";
import type { SeatRef, ShowKey } from "./seats.ts";

interface RawScnInfo {
  readonly scnSseq?: string;
  readonly [key: string]: unknown;
}

interface RawSeatPrice {
  readonly seatLocNo?: string;
  readonly salAmt?: number;
  readonly [key: string]: unknown;
}

interface RawStoInfo {
  readonly posiStoNo?: string;
  readonly bzplcNo?: string;
}

interface RawAdncSeatInfo {
  readonly rlsYmd?: string;
  readonly koficMovfCd?: string;
  readonly siteNm?: string;
  readonly [key: string]: unknown;
}

export interface CheckoutResult {
  readonly ticket: TossPaymentTicket;
  readonly amount: number;
  readonly goodsName: string;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

function first<T>(value: T | readonly T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? ((value[0] as T) ?? null) : (value as T);
}

/** YYYYMMDD (오늘, 서울 기준). 서버가 KST 로 판단하므로 로컬 타임존에 기대지 않는다. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");
}

export class CheckoutResource {
  private readonly http: HttpTransport;
  private readonly identity: IdentityResource;
  private readonly payment: PaymentResource;

  constructor(http: HttpTransport, identity: IdentityResource, payment: PaymentResource) {
    this.http = http;
    this.identity = identity;
    this.payment = payment;
  }

  /** 상영 메타를 모은다. 부수효과 없음. */
  async meta(show: ShowKey): Promise<ShowMeta> {
    const [scnList, adnc, stoList] = await Promise.all([
      this.http.get<RawScnInfo[] | RawScnInfo>("/booking/searchMovScnInfo", {
        siteNo: show.theaterId,
        scnYmd: show.date,
        scnsNo: show.screenId,
        scnSseq: show.sequence,
        rtctlScopCd: RTCTL_SCOPE_WEB,
      }),
      this.http.get<RawAdncSeatInfo>("/booking/searchAtktAdncSeatInfo", {
        siteNo: show.theaterId,
        scnYmd: show.date,
        scnsNo: show.screenId,
        scnSseq: show.sequence,
        dblfrRpsntYn: "N",
        cxprdYn: "N",
        hotdlYn: "N",
        movNo: show.movieId,
      }),
      this.http.get<RawStoInfo[] | RawStoInfo>("/booking/searchSiteByPosiStoNo", {
        siteNo: show.theaterId,
      }),
    ]);

    const rows = Array.isArray(scnList) ? scnList : [scnList];
    const scn = rows.find((row) => row?.scnSseq === show.sequence) ?? rows[0];
    if (scn === undefined || scn === null) {
      throw new Error("상영 회차 정보를 찾지 못했습니다. 회차 번호를 확인하세요.");
    }
    const sto = first(stoList);

    return {
      prodNo: text(scn.prodNo),
      movNm: text(scn.movNm),
      movfNo: text(scn.movfNo),
      rlsYmd: text(adnc?.rlsYmd),
      koficMovfCd: text(adnc?.koficMovfCd),
      bzplcNo: text(scn.bzplcNo, text(sto?.bzplcNo)),
      // paymInfoCont 는 "CGV " 접두어 없는 짧은 극장명을 쓴다.
      siteNm: text(adnc?.siteNm, text(scn.siteNm)),
      scnsNm: text(scn.scnsNm),
      expoScnsNm: text(scn.expoScnsNm, text(scn.scnsNm)),
      scnsrtTm: text(scn.scnsrtTm),
      scnendTm: text(scn.scnendTm),
      salsTznCd: text(scn.salsTznCd),
      tcscnsGradCd: text(scn.tcscnsGradCd),
      sascnsGradCd: text(scn.sascnsGradCd),
      movTirCd: text(scn.movTirCd),
      siteGradCd: text(scn.siteGradCd),
      srvltKindCd: text(scn.srvltKindCd),
      movkndCd: text(scn.movkndCd),
      movkndDsplEnm: text(scn.movkndDsplEnm),
      cratgClsCd: text(scn.cratgClsCd),
      itgrScnsGradCd: text(scn.scnsGradCd),
      stoNo: text(sto?.posiStoNo),
    };
  }

  /**
   * 좌석별 가격. 부수효과 없음.
   * 같은 회차라도 좌석마다 다를 수 있어(4DX PRIME석 등) 좌석 순서대로 돌려준다.
   */
  async prices(show: ShowKey, seats: readonly SeatRef[]): Promise<number[]> {
    const raw = await this.http.post<RawSeatPrice[] | RawSeatPrice>(
      "/booking/searchMovAtktSeatPrcList",
      {
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
          szoneKindCd: seat.szoneKindCd,
          stkndCd: seat.stkndCd,
          seatSalfrmCd: seat.seatSalfrmCd,
          prodBnduCd: "01",
        })),
        zoneGroupYn: "N",
      },
    );

    const rows = Array.isArray(raw) ? raw : [raw];
    return seats.map((seat) => {
      const row = rows.find((item) => item?.seatLocNo === seat.seatLocNo);
      const amount = typeof row?.salAmt === "number" ? row.salAmt : 0;
      if (amount <= 0) {
        throw new Error(
          `${seat.row}${seat.number} 의 가격을 확인하지 못했습니다. ` +
            `응답: ${JSON.stringify(raw).slice(0, 200)}`,
        );
      }
      return amount;
    });
  }

  /** 토스페이 결제수단 객체를 그대로 가져온다. 하드코딩하지 않는다. */
  private async tossMethod(theaterId: string): Promise<unknown> {
    const groups = await this.payment.methods(theaterId);
    for (const group of groups) {
      const list = (group as { paymdList?: unknown[] })?.paymdList;
      const candidates = Array.isArray(list) ? list : [group];
      for (const item of candidates) {
        if ((item as { paykndCd?: string })?.paykndCd === "1008") return item;
      }
    }
    throw new Error("토스페이(1008) 결제수단을 찾지 못했습니다.");
  }

  /**
   * ⚠️ 결제를 실제로 개시한다. 좌석은 이미 선점되어 있어야 한다.
   * 최종 승인은 반환된 URL 에서 사용자가 토스 앱으로 직접 해야 한다.
   */
  async start(args: {
    readonly show: ShowKey;
    readonly seats: readonly SeatRef[];
    readonly movAtktNo: string;
  }): Promise<CheckoutResult> {
    const { show, seats, movAtktNo } = args;
    if (seats.length === 0) throw new Error("결제할 좌석이 없습니다.");

    const [identity, meta, prices, payMethod] = await Promise.all([
      this.identity.resolve(),
      this.meta(show),
      this.prices(show, seats),
      this.tossMethod(show.theaterId),
    ]);

    const price = prices.reduce((sum, amount) => sum + amount, 0);
    const saleDate = today();
    // 좌석이 여러 개면 CGV 도 대표 상품명 하나만 쓴다.
    const goodsName = `${meta.movNm} ${meta.siteNm}`;

    const prepare = {
      theaterId: show.theaterId,
      amount: price,
      goodsName,
      goodsCount: seats.length,
      userId: identity.plainUserId,
      userName: identity.plainUserName,
      saleDate,
    };
    const payment = await this.payment.createPaymentId(prepare);

    const redirectUrl =
      `https://cgv.co.kr/api/pg?paymNo=${payment.paymNo}` +
      `&paymVrifyNo=${payment.paymVrifyNo}` +
      `&host=${encodeURIComponent("https://cgv.co.kr")}`;

    const paymInfoCont = buildPaymInfoCont({
      identity,
      show,
      meta,
      seats,
      movAtktNo,
      prices,
      paymNo: payment.paymNo,
      paymVrifyNo: payment.paymVrifyNo,
      payMethod,
      saleDate,
      goodsName,
      redirectUrl,
    });

    await this.payment.savePaymentInfo(payment, prepare, paymInfoCont);
    await this.payment.openSaleTemp(payment, paymInfoCont);

    const ticket = await this.payment.reserveTossPay({
      payment,
      amount: price,
      userPhone: identity.phone,
      paymInfoCont,
      expireDate: saleDate,
      redirectUrl,
    });

    return { ticket, amount: price, goodsName };
  }
}
