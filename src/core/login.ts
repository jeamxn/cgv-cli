/**
 * CJ ONE SSO 로그인 플로우.
 *
 * 여러 호스트(oidc.cgv.co.kr / cgv.co.kr)를 오가며 쿠키를 누적해야 해서
 * 일반 리소스와 달리 자체 쿠키 자를 들고 직접 fetch 한다(SRP: 로그인 절차만 담당).
 *
 * 관찰된 순서 (2026-08-12 캡처):
 *   1. POST oidc.cgv.co.kr/cjone/cjoneLogin        ← 인증
 *   2. POST cgv.co.kr/api/v1/member/usgStpl/searchMemAgreeUser
 *   3. POST oidc.cgv.co.kr/common/auth/getChkInfo
 *   4. POST oidc.cgv.co.kr/cjone/cjoneLoginAftCgv  ← CGV 세션 확립
 *
 * 비밀번호 평문은 encryptPassword() 로 즉시 암호화되며 보관·로깅하지 않는다.
 */
import { CookieJar } from "./cookie-jar.ts";
import { encryptPassword } from "./crypto.ts";
import { DEFAULT_CONFIG, type CgvConfig } from "./config.ts";
import { CgvAuthError } from "./errors.ts";
import type { Session } from "./session.ts";

const OIDC = "https://oidc.cgv.co.kr";
const WEB = "https://cgv.co.kr";

interface Envelope {
  readonly statusCode?: number;
  readonly statusMessage?: string;
  readonly data?: unknown;
}

/** 로그인 실패 사유를 호출자가 구분할 수 있게 코드를 노출한다. */
export class CgvLoginError extends CgvAuthError {
  readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null = null) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class LoginFlow {
  private readonly jar = new CookieJar();
  private readonly config: CgvConfig;

  constructor(config: CgvConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  async run(userId: string, password: string): Promise<Session> {
    if (userId.trim() === "") throw new CgvLoginError("아이디가 비어 있습니다.");
    if (password === "") throw new CgvLoginError("비밀번호가 비어 있습니다.");

    // Cloudflare 쿠키 확보 (실패해도 치명적이지 않다)
    await this.visitHome();

    const login = await this.post(`${OIDC}/cjone/cjoneLogin`, {
      userId,
      password: encryptPassword(password),
      custLginTypCd: "01",
      custAgtNm: this.config.userAgent,
      devcId: "",
      devcOsTypCd: "",
      devcNm: "",
      appverVal: "",
      devcOsVerNo: "",
    });

    if (login.statusCode !== 0) {
      throw new CgvLoginError(
        login.statusMessage ?? "로그인에 실패했습니다.",
        login.statusCode ?? null,
      );
    }

    const custNo = findCustNo(login.data);
    if (custNo === null) {
      throw new CgvLoginError(
        "로그인은 성공했지만 응답에서 custNo 를 찾지 못했습니다. " +
          "`--cookie` 방식으로 대신 로그인하세요.",
      );
    }

    // 세션 확립에 필요한 후속 호출. 실패해도 로그인 자체는 유효할 수 있어 치명적으로 다루지 않는다.
    await this.tryPost(`${WEB}/api/v1/member/usgStpl/searchMemAgreeUser`, {
      coCd: this.config.coCd,
      userId,
    });
    await this.tryPost(`${OIDC}/common/auth/getChkInfo`, { coCd: this.config.coCd, userId });
    await this.tryPost(`${OIDC}/cjone/cjoneLoginAftCgv`, {
      coCd: this.config.coCd,
      userId,
      custNo,
    });

    const cookie = this.jar.header();
    if (cookie === null) {
      throw new CgvLoginError("로그인 응답에서 세션 쿠키를 받지 못했습니다.");
    }

    return { custNo, cookie, savedAt: new Date().toISOString() };
  }

  private async visitHome(): Promise<void> {
    try {
      const response = await fetch(`${WEB}/`, {
        headers: { "user-agent": this.config.userAgent, "accept-language": "ko-KR" },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      this.jar.absorb(response.headers.getSetCookie());
      await response.arrayBuffer();
    } catch {
      /* 무시 */
    }
  }

  private async post(url: string, body: unknown): Promise<Envelope> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "accept-language": "ko-KR",
      origin: WEB,
      referer: `${WEB}/`,
      "user-agent": this.config.userAgent,
    };
    const cookie = this.jar.header();
    if (cookie !== null) headers["cookie"] = cookie;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "follow",
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    this.jar.absorb(response.headers.getSetCookie());

    const text = await response.text();
    try {
      return JSON.parse(text) as Envelope;
    } catch {
      throw new CgvLoginError(
        `예상치 못한 응답 (HTTP ${response.status}): ${text.slice(0, 160)}`,
      );
    }
  }

  private async tryPost(url: string, body: unknown): Promise<void> {
    try {
      await this.post(url, body);
    } catch {
      /* 후속 단계 실패는 무시하고 쿠키만 챙긴다 */
    }
  }
}

/** 응답 어디에 custNo 가 들어있는지 확정하지 못해 얕게 탐색한다. */
function findCustNo(data: unknown): string | null {
  if (data === null || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;

  for (const key of ["custNo", "userNo", "itgrCustNo"]) {
    const value = record[key];
    if (typeof value === "string" && /^\d+$/.test(value)) return value;
    if (typeof value === "number") return String(value);
  }
  for (const value of Object.values(record)) {
    if (value !== null && typeof value === "object") {
      const nested = findCustNo(value);
      if (nested !== null) return nested;
    }
  }
  return null;
}
