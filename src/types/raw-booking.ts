/**
 * 로그인 이후 플로우(좌석·결제)의 원시 응답/요청 타입.
 * 2026-08-12 캡처를 근거로 하되, 응답 스키마 전체를 확인하지 못한 항목은 unknown 으로 둔다.
 * 추측으로 필드를 채우지 않는다.
 */

/** GET /common/bznsCom/user/searchUserInfo */
export interface RawUserInfo {
  readonly custNo?: string;
  readonly cusgdCd?: string;
  /** 그 외 개인정보 필드는 의도적으로 타입에 노출하지 않는다. */
  readonly [key: string]: unknown;
}

/** GET /booking/searchIfSeatData 의 좌석 1건 (관찰된 필드만) */
export interface RawSeat {
  readonly seatLocNo?: string;
  readonly seatRowNm?: string;
  readonly seatNo?: string;
  readonly sbordNo?: string;
  readonly seatAreaNo?: string;
  readonly szoneNo?: string;
  readonly szoneKindCd?: string;
  readonly stkndCd?: string;
  readonly seatSalfrmCd?: string;
  /** 판매 상태 코드. 값 의미는 미확인 */
  readonly seatStusCd?: string;
  readonly [key: string]: unknown;
}

/** searchIfSeatData 응답. 배열인지 객체인지 확정하지 못해 느슨하게 받는다. */
export type RawSeatData = unknown;

/** POST /content/seatTemp/seatTempPrmp 요청 본문 */
export interface RawSeatHoldRequest {
  readonly coCd: string;
  readonly bymd: string;
  readonly mbltNo: string;
  readonly siteNo: string;
  readonly scnYmd: string;
  readonly scnsNo: string;
  readonly scnSseq: string;
  readonly movAtktNo: string;
  readonly custNo: string;
  readonly cusgdCd: string;
  readonly nmbrCrtfNo: string;
  readonly sachlCd: string;
  readonly atktChnlCd: string;
  readonly sachlTypCd: string;
  readonly rtctlScopCd: string;
  readonly seatPrmpDataList: readonly RawSeatHoldItem[];
}

export interface RawSeatHoldItem {
  readonly seatRowNm: string;
  readonly seatNo: string;
  readonly seatLocNo: string;
  readonly sbordNo: string;
  readonly seatAreaNo: string;
  readonly szoneNo: string;
}

/** POST /content/seatTemp/seatTempPrmpCncl 요청 본문 */
export interface RawSeatReleaseRequest {
  readonly coCd: string;
  readonly movAtktNo: string;
  readonly sachlTypCd: string;
  readonly rtctlScopCd: string;
  readonly custNo: string;
  readonly seatPrmpDataList: readonly RawSeatHoldItem[];
}

/**
 * 선점 응답. 관찰된 것은 발권번호(movAtktNo)와 만료시각(szoneExpTm) 계열이다.
 * 정확한 키 이름을 확정하지 못해 넓게 받는다.
 */
export interface RawSeatHoldResult {
  readonly movAtktNo?: string;
  readonly szoneExpTm?: string;
  readonly [key: string]: unknown;
}

/** POST /booking/searchMovAtktSeatPrcList 요청 본문 */
export interface RawSeatPriceRequest {
  readonly coCd: string;
  readonly siteNo: string;
  readonly scnsNo: string;
  readonly scnYmd: string;
  readonly scnSseq: string;
  readonly movNo: string;
  readonly rtctlScopCd: string;
  readonly prcrulDivCd: string;
  readonly sachlTypCd: string;
  readonly prodBnduList: readonly { readonly prodBnduCd: string; readonly prodBnduQty: number }[];
  readonly seatList: readonly {
    readonly seatLocNo: string;
    readonly szoneKindCd: string;
    readonly stkndCd: string;
    readonly seatSalfrmCd: string;
    readonly prodBnduCd: string;
  }[];
  readonly zoneGroupYn: string;
}

/** GET /payment/pay/searchGroupedPaymdList 의 결제수단 1건 */
export interface RawPaymentMethod {
  readonly paykndCd?: string;
  readonly paykndNm?: string;
  readonly payMethod?: string;
  readonly paymGrpClsNm?: string;
  readonly indctTgtYn?: string;
  readonly [key: string]: unknown;
}

/** GET /payment/mpy/usgStpl/searchUsgStplDtl */
export interface RawTerms {
  readonly usgStplClsCd?: string;
  readonly stplTitNm?: string;
  readonly stplCont?: string;
  readonly [key: string]: unknown;
}

/** POST /payment/pay/commonGetPayId 요청 본문 */
export interface RawPayIdRequest {
  readonly coCd: string;
  readonly siteCode: string;
  readonly mrchClsCd: string;
  readonly sachlTypCd: string;
  readonly rvpayYn: string;
  readonly amountTotal: number;
  readonly totpayFee: number;
  readonly amountVat: number;
  readonly amountTaxFree: number;
  readonly amountTax: number;
  readonly saleDt: string;
  readonly goodsName: string;
  readonly goodsCnt: string;
  readonly userId: string;
  readonly userName: string;
}

/** POST /payment/pay/commonGetPayId 응답 */
export interface RawPayId {
  /** 발급된 결제번호. 이 값이 이후 호출의 paymNo 가 된다. */
  readonly payId?: string;
  readonly [key: string]: unknown;
}

/** POST /payment/pay/onlineAuthRequestReserve 요청 본문 */
export interface RawAuthReserveRequest {
  readonly coCd: string;
  readonly mrchClsCd: string;
  readonly paymNo: string;
  readonly paykndCd: string;
  readonly payMethod: string;
  readonly payMethodCode: string;
  readonly dcNo: string;
  readonly amountTotal: number;
  readonly amountDiscount: number;
  readonly amountVat: number;
  readonly amountTaxFree: number;
  readonly amountTax: number;
  readonly redirectUrl: string;
  readonly cupDepositAmount: number;
  readonly goodsType: string;
  readonly cultureType: string;
  readonly userPhone: string;
  readonly expireDate: string;
  readonly appId: string;
  readonly salitmClsCd: string;
  readonly productItems: string;
}

/** onlineAuthRequestReserve 응답. PG 거래키/리다이렉트 URL 계열. */
export interface RawAuthReserveResult {
  readonly trxKey?: string;
  readonly redirectUrl?: string;
  readonly payUrl?: string;
  readonly [key: string]: unknown;
}

/** GET pay.toss.im/payfront/api/v2/pay-approved-status/{payToken} — CGV 봉투가 아니다. */
export interface RawTossApprovedStatus {
  readonly code?: string;
  readonly success?: unknown;
  readonly [key: string]: unknown;
}
