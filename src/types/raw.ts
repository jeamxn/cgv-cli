/**
 * CGV 원시 응답 타입. 2026-08-12 실제 응답을 그대로 옮긴 것이며 임의 개명하지 않는다.
 * 외부 계약이므로 이 파일은 "관찰된 사실"만 담는다. 가공은 mappers/ 가 담당한다.
 * 숫자성 값도 API 가 문자열로 주므로 string 그대로 둔다.
 */

export interface RawEnvelope<T> {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly data: T;
}

/** GET /booking/searchAtktTopPostrList */
export interface RawMovie {
  readonly coCd: string;
  readonly movNo: string;
  readonly movNm: string;
  /** 포스터 파일명 (320px) */
  readonly i320Fnm: string | null;
  /** 상영시간(분) */
  readonly scnBssTm: string;
  /** 관람등급 코드 */
  readonly cratgClsCd: string;
  /** 예매율 (%) */
  readonly atktRate: string;
  readonly mblUrl: string | null;
}

/** GET /booking/searchAtktTopPostrAttrList */
export interface RawMovieAttribute {
  readonly coCd: string;
  readonly div: string;
  readonly attrCd: string;
  readonly attrNm: string;
}

/** searchRegnList 의 siteList 항목 */
export interface RawSite {
  readonly coCd: string;
  readonly siteNo: string;
  readonly siteNm: string;
  readonly bzplcOperStusNm: string;
  readonly distance: string | null;
  readonly movkndCd: string | null;
}

/** GET /booking/searchRegnList */
export interface RawRegion {
  readonly coCd: string;
  readonly regnGrpCd: string;
  readonly regnGrpNm: string;
  /** 해당 지역의 상영 스케줄 수 */
  readonly schdCnt: string;
  readonly newOpenBzplcYn: string;
  readonly siteList: readonly RawSite[];
  readonly regnGrpCnt: number;
}

/** GET /content/site/searchAllRegionAndSite */
export interface RawAllRegionAndSite {
  readonly movInfo: unknown;
  readonly kndInfo: unknown;
  readonly regionInfo: readonly RawRegionInfo[];
  readonly siteInfo: readonly RawSiteInfo[];
  readonly rcmSiteInfo: unknown;
}

export interface RawRegionInfo {
  readonly comCdval: string;
  readonly comCdvalNm: string;
  readonly cnt: string;
  readonly newOpenBzplcCnt: string;
}

export interface RawSiteInfo {
  readonly regnGrpCd: string;
  readonly siteNo: string;
  readonly siteNm: string;
  readonly distance: string | null;
}

/** GET /booking/searchSiteScnscYmdListByMov, GET /booking/searchLastScnDay */
export interface RawScreeningDay {
  readonly scnYmd: string;
  readonly hldyYn: string | null;
}

/** GET /common/bznsCom/mov/searchRtktCntlYn */
export interface RawRealtimeControl {
  /** Y 면 예매 제어중(=예매 불가) */
  readonly rtktCntlYn: string;
}

/** GET /booking/searchScnsMngList */
export interface RawScreenManagement {
  readonly specialScreenYn: string;
}

/**
 * GET /booking/searchSchByMov — 상영관별 회차 1건.
 * 잔여좌석은 frSeatCnt, 판매가능 총석은 cpSeatCnt, 물리 총석은 stcnt.
 */
export interface RawShowtime {
  readonly coCd: string;
  readonly siteNo: string;
  readonly siteNm: string;
  /** 상영관 번호 */
  readonly scnsNo: string;
  /** 상영관명 (예: "2관 (Laser)") */
  readonly scnsNm: string;
  /** 노출용 상영관명 (스폰서명 포함될 수 있음) */
  readonly expoScnsNm: string;
  readonly scnYmd: string;
  /** 회차 */
  readonly scnSseq: string;
  readonly prodNo: string;
  readonly expoProdNm: string;
  readonly engProdNm: string;
  readonly prodNm: string;
  /** 상영종류 코드 (02=2D 등) */
  readonly movkndCd: string;
  readonly movkndDsplNm: string;
  readonly movkndDsplEnm: string;
  readonly cratgClsCd: string;
  readonly cratgClsNm: string;
  readonly salsTznCd: string;
  readonly salsTznNm: string;
  /** 상영 시작 HHMM */
  readonly scnsrtTm: string;
  /** 상영 종료 HHMM */
  readonly scnendTm: string;
  /** 판매 마감 HHMM */
  readonly salEndTm: string;
  readonly sascnsGradCd: string;
  readonly sascnsGradNm: string;
  readonly tcscnsGradCd: string;
  readonly tcscnsGradNm: string;
  /** 물리 총 좌석수 */
  readonly stcnt: string;
  /** 판매가능 좌석수 */
  readonly cpSeatCnt: string;
  /** 잔여 좌석수 */
  readonly frSeatCnt: string;
  /** Y 면 예매 제어중 */
  readonly cntlYn: string;
  readonly crntrvDsplYn: string;
  readonly hotdlYn: string;
  readonly dblfrNo: string | null;
  readonly dblfrRpsntYn: string | null;
  readonly iceconYn: string;
  readonly arthsYn: string;
  readonly srlsYn: string;
  readonly childnMovYn: string;
  readonly movclsCd: string;
  readonly movclsNm: string;
  readonly speclIndctTypCd: string;
  readonly movTirCd: string;
  readonly siteGradCd: string;
  readonly srvltKindCd: string;
  readonly slddKindCd: string;
  readonly sesnNo: string | null;
  readonly movNo: string;
  readonly movNm: string;
  readonly movEnm: string;
  /** 이동(휠체어 등) 좌석수 */
  readonly mvSeatCnt: string;
  readonly movfNo: string;
  readonly bzplcNo: string;
  readonly vatincYn: string;
  readonly prdtypCd: string;
  readonly prddtlTypCd: string;
  readonly prdcmpTypCd: string;
  readonly cxprdYn: string;
  readonly scnsGradCd: string;
  readonly sortOseq: string;
  readonly prcrulDivCd: string;
  readonly videoAddexpCd: string | null;
  readonly videoAddexpCdNm: string | null;
  readonly videoAddexpCont: string | null;
  readonly sbtdivCd: string | null;
  readonly sbtdivNm: string | null;
  readonly physcFnm: string;
  readonly physcFilePathnm: string;
  /** 잔여 임시좌석수 */
  readonly frtmpSeatCnt: string;
  readonly hotdlDtlNo: string | null;
  /** 실제 영화 시작 HHMM (광고 후) */
  readonly rlMovStartTm: string;
  readonly prmddNo: string | null;
  readonly prmddNm: string | null;
  readonly prodImg: string | null;
  readonly cndProdYn: string | null;
  readonly cndsaTypCd: string | null;
  readonly cndSalYnList: unknown;
}
