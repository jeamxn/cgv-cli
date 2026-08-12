/**
 * paymInfoCont 조립.
 *
 * CGV 는 결제 직전에 "예매 장바구니 전체"를 JSON 문자열 하나로 직렬화해 서버에 저장한다.
 * 좌석(movAtktNo)과 결제(paymNo)를 잇는 유일한 지점이 이 문자열이다.
 *
 * 필드가 수백 개지만 대부분 고정값이므로, 실측 페이로드(2026-08-12 캡처)를 골격으로 두고
 * 변동 값만 주입한다. 모르는 필드를 추측해 채우기보다 실측값을 유지하는 편이 안전하다.
 * 그래서 이 빌더는 용산 2D 일반석 기준으로만 검증되어 있다.
 */
import type { Identity } from "./identity.ts";
import type { SeatRef, ShowKey } from "./seats.ts";

/** searchMovScnInfo 에서 가져오는 상영 메타. 값을 해석하지 않고 그대로 옮긴다. */
export interface ShowMeta {
  readonly prodNo: string;
  readonly movNm: string;
  readonly movfNo: string;
  readonly rlsYmd: string;
  readonly koficMovfCd: string;
  readonly bzplcNo: string;
  readonly siteNm: string;
  readonly scnsNm: string;
  readonly expoScnsNm: string;
  readonly scnsrtTm: string;
  readonly scnendTm: string;
  readonly salsTznCd: string;
  readonly tcscnsGradCd: string;
  readonly sascnsGradCd: string;
  readonly movTirCd: string;
  readonly siteGradCd: string;
  readonly srvltKindCd: string;
  readonly movkndCd: string;
  readonly movkndDsplEnm: string;
  readonly cratgClsCd: string;
  readonly itgrScnsGradCd: string;
  /** 상점번호. searchSiteByPosiStoNo 로 조회한다. */
  readonly stoNo: string;
}

export interface PaymInfoInput {
  readonly identity: Identity;
  readonly show: ShowKey;
  readonly meta: ShowMeta;
  readonly seat: SeatRef;
  readonly movAtktNo: string;
  /** 좌석 1매 가격 */
  readonly price: number;
  readonly paymNo: string;
  readonly paymVrifyNo: string;
  /** searchGroupedPaymdList 에서 고른 결제수단 객체를 통째로 넣는다. */
  readonly payMethod: unknown;
  /** YYYYMMDD. 결제일(오늘) */
  readonly saleDate: string;
  readonly goodsName: string;
  readonly redirectUrl: string;
}

/** "2130" → "21:30" */
function colon(time: string): string {
  return time.length === 4 ? `${time.slice(0, 2)}:${time.slice(2)}` : time;
}

function posterUrl(movNo: string): string {
  const group = `0${movNo.slice(0, 5)}`;
  return `https://cdn.cgv.co.kr/cgvpomsfilm/Movie/Thumbnail/Poster/${group}/${movNo}/${movNo}_185.jpg`;
}

/** 부가세는 CGV 가 공급가/부가세로 쪼갠다 (실측: 15000 → 13636 + 1364). */
export function splitVat(amount: number): { readonly vat: number; readonly tax: number } {
  const vat = Math.round(amount / 11);
  return { vat, tax: amount - vat };
}

function buildTicketProducts(input: PaymInfoInput): Record<string, unknown> {
  const { show, meta, seat, price } = input;
  return {
    scnYmd: show.date,
    scnTm: meta.scnsrtTm,
    siteNo: show.theaterId,
    scnsNo: show.screenId,
    scnsNm: meta.scnsNm,
    scnSseq: show.sequence,
    seatLocNo: seat.seatLocNo,
    szoneCd: seat.szoneNo,
    szoneNm: "일반존",
    szoneNo: seat.szoneNo,
    stkndCd: "01",
    stkndNm: "일반석",
    seatAreaNo: seat.seatAreaNo,
    szoneKindCd: "01",
    szoneKindNm: "일반",
    seatSalfrmCd: "01",
    siteGradCd: meta.siteGradCd,
    tcscnsGradCd: meta.tcscnsGradCd,
    videoAddexpCd: null,
    prodBnduCd: "01",
    prodBnduNm: "일반",
    scnsrtTm: meta.scnsrtTm,
    scnendTm: meta.scnendTm,
    movNo: show.movieId,
    movNm: meta.movNm,
    movTirCd: meta.movTirCd,
    movfNo: meta.movfNo,
    movkndCd: meta.movkndCd,
    rlsYmd: meta.rlsYmd,
    rtctlScopCd: "08",
    salsTznCd: meta.salsTznCd,
    sascnsGradCd: meta.sascnsGradCd,
    rtktAmt: price,
    sbordNo: seat.sbordNo,
    seatNo: seat.number,
    seatRowNm: seat.row,
    movAtktNo: input.movAtktNo,
    salAmt: price,
    scnAmt: price,
    tcsvcAmt: 0,
    sasvcAmt: 0,
    smtScnRepYn: null,
    smtScnNo: null,
    smtScnYn: null,
    hrzoneCd: meta.salsTznCd,
    speclIndctTypCd: "01",
    vatincYn: "Y",
    prcrulDivCd: "01",
    itgrScnsGradCd: meta.itgrScnsGradCd,
    movEtcAttrCd: null,
  };
}

function buildMov(input: PaymInfoInput): Record<string, unknown> {
  const { show, meta, price, identity } = input;
  const poster = posterUrl(show.movieId);

  const sellProduct = {
    bzplcTypCd: "01",
    dblfrNo: null,
    dblfrYn: null,
    cxprdYn: "N",
    prodImg: poster,
    dblfrProducts: null,
    dcAmt: 0,
    giftYn: "N",
    movAtktNo: input.movAtktNo,
    parntGrpProdNo: null,
    prcrulDivCd: "01",
    prdcmpTypCd: "01",
    prddtlTypCd: "0101",
    prdtypCd: "01",
    prodNm: meta.movNm,
    prodNo: meta.prodNo,
    prodPrc: price,
    salAmt: price,
    salQty: 1,
    selBzplcNo: meta.bzplcNo,
    selSiteNo: show.theaterId,
    selStoNo: meta.stoNo,
    ticketProducts: buildTicketProducts(input),
    generalProducts: null,
    cmpProductsList: null,
    speclIndctTypCd: "01",
    vatincYn: "Y",
    hotdlNo: null,
    hotdlTypCd: "02",
  };

  return {
    cratgClsCd: meta.cratgClsCd,
    prodNo: meta.prodNo,
    movNo: show.movieId,
    movNm: meta.movNm,
    orgMovNm: meta.movNm,
    cpnTypCd: "0",
    nmbrCrtf: null,
    bzplcNo: meta.bzplcNo,
    cntCgvAempYn: "N",
    cntCjAempYn: "N",
    prdcmpTypCd: "01",
    prddtlTypCd: "0101",
    movfNo: meta.movfNo,
    rlsYmd: meta.rlsYmd,
    scnNm: meta.scnsNm,
    expoScnsNm: meta.expoScnsNm,
    scnYmd: show.date,
    scnTm: `${colon(meta.scnsrtTm)}~${colon(meta.scnendTm)}`,
    scnsNo: show.screenId,
    scnSseq: show.sequence,
    sachlTypCd: "01",
    prodBnduCd: "01",
    bnduQty: "1",
    szoneKindCd: "01",
    stkndCd: "01",
    amountTotal: "0",
    szoneExpTm: "",
    prcrulDivCd: "01",
    salsTznCd: meta.salsTznCd,
    tcscnsGradCd: meta.tcscnsGradCd,
    sascnsGradCd: meta.sascnsGradCd,
    movTirCd: meta.movTirCd,
    siteGradCd: meta.siteGradCd,
    srvltKindCd: meta.srvltKindCd,
    rtctlScopCd: "08",
    movEtcAttrCd: null,
    movkndCd: meta.movkndCd,
    movkndDsplEnm: meta.movkndDsplEnm,
    videoAddexpCd: null,
    dblfrNo: null,
    dblfrYn: "N",
    cjAempYn: "N",
    prdtypCd: "01",
    bzplcTypCd: "01",
    itgrScnsGradCd: meta.itgrScnsGradCd,
    sellProductsList: [sellProduct],
    custNo: identity.cust.custNo,
    sumSalAmt: price,
    siteNo: show.theaterId,
    cxprdYn: "N",
    ticketProducts: [],
    dblfrProducts: null,
    cmpProductsList: null,
    koficMovfCd: meta.koficMovfCd,
    prodImg: poster,
    movDtlKindsList: [{ cratgClsNm: "일반", atktQty: "1", prodBnduCd: "01" }],
    discountDatas: [null],
  };
}

/** 결제 저장 API 에 실을 JSON 문자열을 만든다. */
export function buildPaymInfoCont(input: PaymInfoInput): string {
  const { identity, meta, price } = input;
  const { vat, tax } = splitVat(price);

  const payload = {
    ipAddress: "",
    coCd: "A420",
    cust: identity.cust,
    cjOneUser: {
      memberRegYn: "Y",
      memberNo: identity.itgrCustNo,
      memberName: identity.cust.userName,
      memberStatusCode: "10",
      memberLevelCode: "10",
      saveWay: "",
      filler: "",
      mobileNo: identity.cust.userCellPhone,
      // 포인트는 사용하지 않으므로(cjOnePntUseYn=N) 잔액을 채우지 않는다.
      avlPoint: 0,
      avlSchdPoint: 0,
      presentAvlPoint: 0,
      saveTotalPoint: 0,
      useTotalPoint: 0,
      xtnctSchdPoint: 0,
    },
    saleDt: input.saleDate,
    siteNo: input.show.theaterId,
    siteNm: meta.siteNm,
    mrchClsCd: "1001",
    sachlCd: "10",
    sachlTypCd: "01",
    payMethodTabList: [
      { label: "CGV 스마트결제", value: "01" },
      { label: "일반결제", value: "02" },
    ],
    payMethodTab: { label: "일반결제", value: "02" },
    payMethod: input.payMethod,
    creditCardList: null,
    creditCard: null,
    creditCardOption: null,
    cardPointYN: "N",
    creditCardDcCpnUseYn: "N",
    creditCardDcValidYn: "N",
    onlineAuthUseYn: "N",
    onlineAuthAplyYn: "N",
    isNaverPayEduYn: "N",
    isCultureNHYn: "N",
    isCultureNHValidYn: "N",
    paymNo: input.paymNo,
    paymVrifyNo: input.paymVrifyNo,
    traceNo: "",
    amountTotal: price,
    amountPaymTotal: price,
    amountDiscount: 0,
    amountVat: vat,
    amountTax: tax,
    amountTaxFree: 0,
    cupDepositAmount: 0,
    quota: "00",
    giftYn: "N",
    regirYn: "N",
    cjOnePntUseYn: "N",
    cjOnePntUse: 0,
    cjOneAuthFlag: "",
    cjOnePntDiscData: null,
    cjGiftUseYn: "N",
    cjGiftAvlAmount: 0,
    cjGiftUse: 0,
    cjGiftDiscData: null,
    showCjGiftBalance: false,
    cgvGiftUseYn: "N",
    cgvGiftAvlAmount: 0,
    cgvGiftUse: 0,
    cgvGiftDiscData: null,
    showCgvGiftBalance: false,
    giftCardList: [],
    isStaff: "N",
    isStaffDcUseYn: "N",
    redirectUrl: input.redirectUrl,
    payType: "mov",
    goodsName: input.goodsName,
    goodsCnt: "1",
    goodsType: "N",
    imdtlOrdYn: "N",
    traceType: "0",
    pickupPerson: "",
    pickupPhoneNm: "",
    pickupStartYmd: "",
    pickupEndYmd: "",
    cashReceiptYList: [],
    cashReceiptAcceptList: [],
    cashReceiptNotAcceptList: [],
    cashReceiptInfo: identity.phone,
    cashReceiptTraceType: "01",
    cashrtUseYn: "Y",
    cashrtList: [],
    channel: "ONLINE",
    cultureType: "Y",
    salSprExpYn: "N",
    salSprYn: "N",
    salSprOrgSalNo: "",
    salSprOrgPaymNo: "",
    salSprOrgPaymVrifyNo: "",
    outOfStock: "N",
    imdtlDc: null,
    imdtlDcYn: "N",
    imdtlDcUseYn: "N",
    appId: "",
    giftcardSaveTelegram0104: null,
    isHotdl: "N",
    vipHalfPntUseYn: "N",
    vipHalfPntDiscData: null,
    cdcDlveProdInclsYn: "N",
    scntsSalNo: null,
    scntsSalNoSeatList: null,
    scntsSalNoSearchYn: "N",
    szoneExpChkStep: 0,
    szoneExpChk: true,
    szoneExpTm: "",
    purchaseInfoExpYn: "Y",
    smartPayTooltipExpYn: "Y",
    discounts: {
      sellDiscountList: [],
      ticketDiscountList: [],
      productDiscountList: [],
      giftcDiscountList: [],
      sbzSvcDiscountList: [],
    },
    pntParam: null,
    mov: buildMov(input),
    sto: null,
    gft: null,
    act: null,
    ptp: null,
    prk: null,
    ccl: null,
    pmd: null,
    pld: null,
    coopList: [],
    onlnList: [],
    coopCpnList: [],
    hotdlYn: "",
    hotdlDtlNo: "",
    salSprPayDtos: null,
  };

  return JSON.stringify(payload);
}
