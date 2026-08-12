/**
 * 클라이언트 전역 설정.
 *
 * 왜 UA/referer 를 고정하는가:
 * CGV 는 Cloudflare Bot Management 뒤에 있다. 실측(2026-08-12)에 따르면 차단 기준은
 * 헤더가 아니라 TLS 지문이라서 curl 은 403, Node 내장 fetch(undici)는 200 이다.
 * 다만 브라우저와 동일한 헤더 조합을 보내는 편이 레이트리밋에 덜 걸린다.
 */
export interface CgvConfig {
  /** 예매 API 베이스 (Next.js BFF) */
  readonly baseUrl: string;
  /** __cf_bm 쿠키 부트스트랩용 문서 URL */
  readonly originUrl: string;
  /** 법인코드. CGV 는 A420 */
  readonly coCd: string;
  readonly userAgent: string;
  readonly referer: string;
  /** 403/네트워크 오류 시 재시도 횟수 (최초 시도 제외) */
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: CgvConfig = {
  baseUrl: "https://cgv.co.kr/api/v1",
  originUrl: "https://cgv.co.kr/",
  coCd: "A420",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  referer: "https://cgv.co.kr/cnm/movieBook/movie",
  maxRetries: 2,
  retryDelayMs: 400,
  timeoutMs: 10_000,
};

/** 실시간 예매제어 범위 코드. PC/웹 예매는 08 */
export const RTCTL_SCOPE_WEB = "08";

/** 관람등급 코드 → 표기. 미확인 코드는 코드 그대로 노출한다. */
export const RATING_NAMES: Readonly<Record<string, string>> = {
  "01": "청소년관람불가",
  "02": "15세이상관람가",
  "03": "12세이상관람가",
  "04": "전체관람가",
};
