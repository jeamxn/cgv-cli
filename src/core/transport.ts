/**
 * HTTP 계층. 리소스들이 fetch 를 직접 알지 않도록 인터페이스로 격리한다(DIP).
 * 테스트에서는 HttpTransport 를 stub 으로 갈아끼우면 된다.
 */
import { CookieJar } from "./cookie-jar.ts";
import { DEFAULT_CONFIG, type CgvConfig } from "./config.ts";
import { CgvApiError, CgvBlockedError, CgvNetworkError } from "./errors.ts";
import type { RawEnvelope } from "../types/raw.ts";

export type QueryValue = string | number | boolean | undefined | null;
export type Query = Readonly<Record<string, QueryValue>>;

export interface HttpTransport {
  /** CGV 응답 봉투를 풀어 data 만 돌려준다. */
  get<T>(path: string, query?: Query): Promise<T>;
}

const CF_COOKIE = "__cf_bm";

export class FetchTransport implements HttpTransport {
  private readonly jar = new CookieJar();
  /** 동시 호출 시 부트스트랩이 중복되지 않도록 하는 single-flight 슬롯 */
  private bootstrapping: Promise<void> | null = null;
  private readonly config: CgvConfig;

  constructor(config: CgvConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = this.buildUrl(path, query);
    const response = await this.requestWithRetry(url);
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
  private async requestWithRetry(url: string): Promise<Response> {
    const maxAttempts = this.config.maxRetries + 1;
    let lastReason = "unknown";
    let lastCause: unknown;
    let blocked = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await this.ensureCookie();

      let response: Response;
      try {
        response = await fetch(url, {
          headers: this.apiHeaders(),
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
      throw new CgvNetworkError(url, `HTTP ${response.status} ${response.statusText}`);
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

  private apiHeaders(): Record<string, string> {
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
    const cookie = this.jar.header();
    if (cookie !== null) headers["cookie"] = cookie;
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
