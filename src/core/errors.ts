/**
 * 에러 3종. 실패를 빈 배열로 뭉개지 않기 위해 원인별로 구분한다.
 *
 * 참고: Node 의 strip-only TS 실행은 파라미터 프로퍼티를 지원하지 않으므로
 * 필드를 명시적으로 선언한다.
 */

export abstract class CgvError extends Error {
  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Cloudflare 가 요청을 차단했다 (HTTP 403). 쿠키 재발급 후에도 실패한 상태. */
export class CgvBlockedError extends CgvError {
  readonly url: string;
  readonly attempts: number;

  constructor(url: string, attempts: number) {
    super(
      `Cloudflare 가 요청을 차단했습니다 (${attempts}회 시도). ` +
        `curl/axios 같은 클라이언트는 TLS 지문 때문에 항상 차단됩니다. ` +
        `Node 20+ 내장 fetch 로 실행 중인지 확인하세요. url=${url}`,
    );
    this.url = url;
    this.attempts = attempts;
  }
}

/** HTTP 200 이지만 CGV 가 statusCode !== 0 으로 실패를 알린 경우. */
export class CgvApiError extends CgvError {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly url: string;

  constructor(statusCode: number, statusMessage: string, url: string) {
    super(`CGV API 오류 [${statusCode}] ${statusMessage} (url=${url})`);
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.url = url;
  }
}

/** 로그인 세션이 없거나 만료됐다. */
export class CgvAuthError extends CgvError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 부수효과(좌석 잠금·결제 예약)를 확인 없이 실행하려 했다.
 * 실수로 돈이 나가거나 좌석이 묶이는 것을 막는 장치다.
 */
export class CgvConfirmationRequiredError extends CgvError {
  constructor(action: string) {
    super(
      `'${action}' 는 실제 부수효과가 있는 작업입니다. 진행하려면 --confirm 을 붙이세요.`,
    );
  }
}

/** 재시도를 소진한 네트워크/타임아웃 오류, 또는 예상치 못한 HTTP 상태. */
export class CgvNetworkError extends CgvError {
  readonly url: string;

  constructor(url: string, reason: string, cause?: unknown) {
    super(`CGV 요청 실패: ${reason} (url=${url})`, cause === undefined ? undefined : { cause });
    this.url = url;
  }
}
