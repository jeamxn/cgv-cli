/**
 * HTTP 계층. 리소스들이 fetch 를 직접 알지 않도록 인터페이스로 격리한다(DIP).
 * 테스트에서는 HttpTransport 를 stub 으로 갈아끼우면 된다.
 */
import { CookieJar } from "./cookie-jar.ts";
import { DEFAULT_CONFIG, type CgvConfig } from "./config.ts";
import { CgvApiError, CgvBlockedError, CgvError, CgvNetworkError } from "./errors.ts";
import type { SessionStore } from "./session.ts";
import type { RawEnvelope } from "../types/raw.ts";

export type QueryValue = string | number | boolean | undefined | null;
export type Query = Readonly<Record<string, QueryValue>>;

export interface HttpTransport {
  /** CGV 응답 봉투를 풀어 data 만 돌려준다. */
  get<T>(path: string, query?: Query): Promise<T>;
  /** JSON 본문 POST. 응답 봉투를 풀어 data 만 돌려준다. */
  post<T>(path: string, body: unknown, query?: Query): Promise<T>;
}

const CF_COOKIE = "__cf_bm";

export class FetchTransport implements HttpTransport {
  private readonly jar = new CookieJar();
  /** 동시 호출 시 부트스트랩이 중복되지 않도록 하는 single-flight 슬롯 */
  private bootstrapping: Promise<void> | null = null;
  private readonly config: CgvConfig;
  /** 로그인 세션(쿠키) 공급자. 없으면 비로그인 모드. */
  private readonly sessions: SessionStore | null;

  constructor(config: CgvConfig = DEFAULT_CONFIG, sessions: SessionStore | null = null) {
    this.config = config;
    this.sessions = sessions;
  }

  async get<T>(path: string, query: Query = {}): Promise<T> {
    return this.unwrap(path, await this.requestWithRetry(this.buildUrl(path, query)));
  }

  async post<T>(path: string, body: unknown, query: Query = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    return this.unwrap(
      path,
      await this.requestWithRetry(url, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      }),
    );
  }

  private async unwrap<T>(url: string, response: Response): Promise<T> {
    const envelope = (await response.json()) as RawEnvelope<T>;
    if (envelope.statusCode !== 0) {
      throw new CgvApiError(envelope.statusCode, envelope.statusMessage, url);
    }
    return envelope.data;
  }

  private buildUrl(path: string, query: Query): string {
    const url = new URL(`${this.config.baseUrl}${path}`);
    // coCd 는 모든 엔드포인트 공통이라 여기서 기본 주입한다.
    url.searchParams.set("coCd", this.config.coCd);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** 403 이면 쿠키를 버리고 재부트스트랩 후 재시도한다. */
  private async requestWithRetry(url: string, init: RequestInit = {}): Promise<Response> {
    const maxAttempts = this.config.maxRetries + 1;
    let lastReason = "unknown";
    let lastCause: unknown;
    let blocked = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.ensureCookie();

      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: this.apiHeaders(init.method === "POST"),
          redirect: "follow",
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
      } catch (cause) {
        lastReason = cause instanceof Error ? cause.message : "fetch 실패";
        lastCause = cause;
        await this.backoff(attempt);
        continue;
      }

      this.absorbCookies(response);

      if (response.ok) return response;

      if (response.status === 403) {
        blocked = true;
        // 쿠키가 상했을 수 있으므로 폐기하고 다음 시도에서 새로 받는다.
        this.jar.clear();
        this.bootstrapping = null;
        lastReason = "HTTP 403";
        await this.backoff(attempt);
        continue;
      }

      // 그 외 4xx/5xx 는 재시도 가치가 없다고 보고 즉시 실패시킨다.
      // 단 CGV 는 4xx 본문에도 사람이 읽을 사유를 담아준다
      // ("이미 다른 고객이 예매 중인 좌석입니다" 등). 버리지 않는다.
      throw await describeFailure(url, response);
    }

    if (blocked) throw new CgvBlockedError(url, maxAttempts);
    throw new CgvNetworkError(url, lastReason, lastCause);
  }

  /**
   * __cf_bm 확보. 실측상 이 쿠키 없이도 API 가 동작하므로 실패는 치명적이지 않다 —
   * 조용히 넘기고 실제 요청에서 판정한다.
   */
  private async ensureCookie(): Promise<void> {
    if (this.jar.has(CF_COOKIE)) return;
    this.bootstrapping ??= this.bootstrap().finally(() => {
      this.bootstrapping = null;
    });
    await this.bootstrapping;
  }

  private async bootstrap(): Promise<void> {
    try {
      const response = await fetch(this.config.originUrl, {
        headers: this.documentHeaders(),
        redirect: "follow",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      this.absorbCookies(response);
      // 본문은 필요 없지만 소켓 정리를 위해 소비한다.
      await response.arrayBuffer();
    } catch {
      // 부트스트랩 실패는 무시 (쿠키는 최적화일 뿐 필수 아님)
    }
  }

  private absorbCookies(response: Response): void {
    this.jar.absorb(response.headers.getSetCookie());
  }

  private apiHeaders(json = false): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "accept-language": "ko-KR",
      "cache-control": "no-cache",
      pragma: "no-cache",
      referer: this.config.referer,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": this.config.userAgent,
    };
    if (json) headers["content-type"] = "application/json";

    // Cloudflare 쿠키 + 로그인 세션 쿠키를 합친다. 세션이 뒤에 와야 덮어쓰기가 안전하다.
    const parts: string[] = [];
    const cfCookie = this.jar.header();
    if (cfCookie !== null) parts.push(cfCookie);
    const session = this.sessions?.load();
    if (session !== null && session !== undefined) parts.push(session.cookie);
    if (parts.length > 0) headers["cookie"] = parts.join("; ");

    // 일부 엔드포인트(member/*, payment/*)는 쿠키만으로는 401 을 준다.
    // 브라우저도 쿠키의 accessToken 을 읽어 Authorization 헤더로 다시 실어 보낸다.
    const token = session === null || session === undefined ? null : readAccessToken(session.cookie);
    if (token !== null) headers["authorization"] = `Bearer ${token}`;

    return headers;
  }

  private documentHeaders(): Record<string, string> {
    return {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "none",
      "upgrade-insecure-requests": "1",
      "user-agent": this.config.userAgent,
    };
  }

  private async backoff(attempt: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.config.retryDelayMs * attempt));
  }
}

/**
 * 실패 응답을 사람이 읽을 수 있는 에러로 바꾼다.
 * 본문에 statusMessage 가 있으면 그것을 쓰고, 없을 때만 HTTP 상태로 떨어진다.
 */
async function describeFailure(url: string, response: Response): Promise<CgvError> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    /* 본문을 못 읽어도 상태코드로는 보고할 수 있다 */
  }

  try {
    const envelope = JSON.parse(body) as { statusCode?: unknown; statusMessage?: unknown };
    if (typeof envelope.statusMessage === "string" && envelope.statusMessage !== "") {
      const code =
        typeof envelope.statusCode === "number" ? envelope.statusCode : response.status;
      return new CgvApiError(code, envelope.statusMessage, url);
    }
  } catch {
    /* JSON 이 아니면 아래로 */
  }

  return new CgvNetworkError(url, `HTTP ${response.status} ${response.statusText}`);
}

/** 세션 쿠키 문자열에서 accessToken 값을 꺼낸다. 없으면 null. */
function readAccessToken(cookie: string): string | null {
  const match = /(?:^|;\s*)accessToken=([^;]+)/.exec(cookie);
  const value = match?.[1];
  if (value === undefined) return null;
  return decodeURIComponent(value);
}
