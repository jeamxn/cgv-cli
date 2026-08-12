/**
 * 결제수단 · 약관 · 토스페이 결제 준비.
 *
 * ⚠️ 중요한 한계: 결제 "완료" 는 이 코드로 불가능하다.
 * 토스페이는 사용자가 토스 앱에서 직접 승인하는 out-of-band 인증이고,
 * 최종 승인 해시(hashValue)는 PG 서버가 생성한다.
 * 따라서 이 리소스가 할 수 있는 최대치는 "결제 URL 생성 + 승인 상태 폴링" 이다.
 */
import type { HttpTransport } from "../core/transport.ts";
import type { AuthResource } from "./auth.ts";
import type {
  RawAuthReserveResult,
  RawPayId,
  RawPaymentMethod,
  RawTerms,
  RawTossApprovedStatus,
} from "../types/raw-booking.ts";

/** 토스페이(온라인) 결제수단 코드. 덤프에서 확인된 값. */
export const TOSS_PAY = { paykndCd: "1008", payMethod: "tossPayCert" } as const;

/** 결제 약관 분류 코드. 덤프에서 확인된 값. */
const TERMS_CLASS_CODE = "29";

export interface PaymentPrepareInput {
  readonly theaterId: string;
  /** 총 결제금액 (원) */
  readonly amount: number;
  /** 상품명. 영수증/PG 화면에 표시된다. */
  readonly goodsName: string;
  readonly goodsCount: number;
  /** CGV 로그인 아이디 */
  readonly userId: string;
  /** 예매자 이름 */
  readonly userName: string;
  /** YYYYMMDD */
  readonly saleDate: string;
}

export interface PaymentIdentity {
  readonly paymNo: string;
  readonly paymVrifyNo: string;
}

export interface TossPaymentTicket {
  /** PG 거래키 */
  readonly trxKey: string | null;
  /** 사용자가 열어야 하는 URL (토스 승인 페이지). 없으면 응답에서 찾지 못한 것. */
  readonly approvalUrl: string | null;
  readonly payment: PaymentIdentity;
  readonly raw: RawAuthReserveResult;
}

export type TossApprovalState = "APPROVED" | "PENDING" | "UNKNOWN";

export class PaymentResource {
  private readonly http: HttpTransport;
  private readonly auth: AuthResource;

  constructor(http: HttpTransport, auth: AuthResource) {
    this.http = http;
    this.auth = auth;
  }

  /** 사용 가능한 결제수단. 부수효과 없음. */
  async methods(theaterId: string): Promise<RawPaymentMethod[]> {
    this.auth.require();
    const raw = await this.http.get<RawPaymentMethod[] | RawPaymentMethod>(
      "/payment/pay/searchGroupedPaymdList",
      { siteNo: theaterId, bzplcTypCds: "01", prdtypCds: "01", mbrYn: "Y" },
    );
    return Array.isArray(raw) ? raw : [raw];
  }

  /** 결제 약관 상세. 부수효과 없음. */
  async terms(): Promise<RawTerms[]> {
    this.auth.require();
    const raw = await this.http.get<RawTerms[] | RawTerms>("/payment/mpy/usgStpl/searchUsgStplDtl", {
      usgStplClsCd: TERMS_CLASS_CODE,
      ntcYn: "Y",
      expoChnlCd: "02",
    });
    return Array.isArray(raw) ? raw : [raw];
  }

  /**
   * ⚠️ 결제번호를 발급한다. 결제 세션을 여는 부수효과가 있다.
   */
  async createPaymentId(input: PaymentPrepareInput): Promise<PaymentIdentity> {
    this.auth.require();
    const raw = await this.http.post<RawPayId>("/payment/pay/commonGetPayId", {
      coCd: "A420",
      siteCode: input.theaterId,
      mrchClsCd: "1001",
      sachlTypCd: "01",
      rvpayYn: "N",
      amountTotal: input.amount,
      totpayFee: 0,
      amountVat: 0,
      amountTaxFree: 0,
      amountTax: 0,
      saleDt: input.saleDate,
      goodsName: input.goodsName,
      goodsCnt: String(input.goodsCount),
      userId: input.userId,
      userName: input.userName,
    });

    const paymNo = typeof raw?.paymNo === "string" ? raw.paymNo : "";
    const paymVrifyNo = typeof raw?.paymVrifyNo === "string" ? raw.paymVrifyNo : "";
    if (paymNo === "" || paymVrifyNo === "") {
      throw new Error(
        `결제번호 발급 응답을 해석하지 못했습니다. 응답: ${JSON.stringify(raw).slice(0, 300)}`,
      );
    }
    return { paymNo, paymVrifyNo };
  }

  /**
   * ⚠️ PG 인증을 예약해 토스 승인 URL 을 받는다.
   * 이 호출 자체가 결제를 확정하지는 않지만, 결제 절차를 실제로 개시한다.
   *
   * 승인은 사용자가 반환된 URL 에서 토스 앱으로 직접 해야 한다.
   */
  async reserveTossPay(args: {
    readonly payment: PaymentIdentity;
    readonly amount: number;
    readonly userPhone: string;
    /** YYYYMMDD */
    readonly expireDate: string;
    /** PG 가 결제 후 돌아올 CGV 콜백 */
    readonly redirectUrl?: string;
  }): Promise<TossPaymentTicket> {
    this.auth.require();

    const redirectUrl =
      args.redirectUrl ??
      `https://cgv.co.kr/api/pg?paymNo=${args.payment.paymNo}` +
        `&paymVrifyNo=${args.payment.paymVrifyNo}` +
        `&host=${encodeURIComponent("https://cgv.co.kr")}`;

    // 부가세는 CGV 가 공급가/부가세로 쪼개 보낸다 (실측: 15000 → 13636 + 1364).
    const amountVat = Math.round(args.amount / 11);
    const amountTax = args.amount - amountVat;

    const raw = await this.http.post<RawAuthReserveResult>(
      "/payment/pay/onlineAuthRequestReserve",
      {
        coCd: "A420",
        mrchClsCd: "1001",
        paymNo: args.payment.paymNo,
        paykndCd: TOSS_PAY.paykndCd,
        payMethod: TOSS_PAY.payMethod,
        payMethodCode: "",
        dcNo: "",
        amountTotal: args.amount,
        amountDiscount: 0,
        amountVat,
        amountTaxFree: 0,
        amountTax,
        redirectUrl,
        cupDepositAmount: 0,
        goodsType: "N",
        cultureType: "Y",
        userPhone: args.userPhone,
        expireDate: args.expireDate,
        appId: "",
        salitmClsCd: "01",
        productItems: "",
      },
    );

    return {
      trxKey: typeof raw?.trxKey === "string" ? raw.trxKey : null,
      approvalUrl: extractUrl(raw),
      payment: args.payment,
      raw,
    };
  }

  /**
   * 토스 승인 상태 폴링. CGV 가 아니라 토스 도메인을 직접 부르므로
   * transport 를 쓰지 않고 fetch 를 직접 쓴다 (응답 봉투 형식이 다르다).
   */
  async tossApprovalState(payToken: string): Promise<{
    readonly state: TossApprovalState;
    readonly raw: RawTossApprovedStatus | string;
  }> {
    const response = await fetch(
      `https://pay.toss.im/payfront/api/v2/pay-approved-status/${encodeURIComponent(payToken)}`,
      {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );

    const text = await response.text();
    let raw: RawTossApprovedStatus | string = text;
    try {
      raw = JSON.parse(text) as RawTossApprovedStatus;
    } catch {
      /* 텍스트 그대로 둔다 */
    }

    // 응답 스키마를 확정하지 못했으므로 문자열 신호로 판정하고, 애매하면 UNKNOWN 을 돌려준다.
    const upper = text.toUpperCase();
    const state: TossApprovalState = upper.includes("APPROVED")
      ? "APPROVED"
      : upper.includes("PENDING") || upper.includes("WAIT")
        ? "PENDING"
        : "UNKNOWN";

    return { state, raw };
  }
}

/** 응답에서 사용자가 열어야 할 URL 을 찾는다. 키 이름이 확정되지 않아 후보를 훑는다. */
function extractUrl(raw: RawAuthReserveResult | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  for (const key of ["payUrl", "redirectUrl", "authUrl", "onlineUrl"]) {
    const value = raw[key];
    if (typeof value === "string" && value.startsWith("http")) return value;
  }
  return null;
}
