/**
 * 로그인 세션 관리.
 *
 * 비밀번호를 다루지 않는다. 브라우저에서 로그인한 세션 쿠키를 주입받는 방식이다.
 * 이유는 src/core/session.ts 주석 참조.
 */
import type { HttpTransport } from "../core/transport.ts";
import { normalizeCookieHeader, type Session, type SessionStore } from "../core/session.ts";
import { CgvAuthError } from "../core/errors.ts";
import { LoginFlow } from "../core/login.ts";
import type { RawUserInfo } from "../types/raw-booking.ts";

export class AuthResource {
  private readonly http: HttpTransport;
  private readonly sessions: SessionStore;

  constructor(http: HttpTransport, sessions: SessionStore) {
    this.http = http;
    this.sessions = sessions;
  }

  /**
   * 아이디/비밀번호로 로그인한다 (RSA-OAEP 암호화).
   *
   * 비밀번호는 암호화 직후 폐기되며 저장·로깅하지 않는다.
   * ⚠️ 비밀번호를 반복해서 틀리면 계정이 잠기고 캡차가 요구될 수 있다.
   */
  async login(userId: string, password: string): Promise<Session> {
    const session = await new LoginFlow().run(userId, password);
    this.sessions.save(session);
    return session;
  }

  /**
   * 브라우저에서 복사한 Cookie 헤더와 custNo 로 세션을 저장한다.
   * 저장 전에 실제로 유효한지 서버에 확인한다.
   */
  async adopt(rawCookie: string, custNo: string): Promise<Session> {
    const cookie = normalizeCookieHeader(rawCookie);
    if (cookie === "") throw new CgvAuthError("쿠키 문자열이 비어 있습니다.");
    if (!/^\d+$/.test(custNo)) throw new CgvAuthError(`custNo 형식이 올바르지 않습니다: ${custNo}`);

    const session: Session = { custNo, cookie, savedAt: new Date().toISOString() };
    this.sessions.save(session);

    try {
      await this.whoami();
    } catch (error) {
      this.sessions.clear();
      throw new CgvAuthError(
        `세션이 유효하지 않아 저장을 취소했습니다. 브라우저에서 다시 복사하세요. (원인: ${
          error instanceof Error ? error.message : String(error)
        })`,
      );
    }
    return session;
  }

  current(): Session | null {
    return this.sessions.load();
  }

  /** 세션이 없으면 즉시 실패시킨다. 로그인 필요한 리소스가 공통으로 쓴다. */
  require(): Session {
    const session = this.sessions.load();
    if (session === null) {
      throw new CgvAuthError("로그인 세션이 없습니다. `cgv login` 을 먼저 실행하세요.");
    }
    return session;
  }

  logout(): void {
    this.sessions.clear();
  }

  /** 세션 유효성 확인. 개인정보는 반환하지 않고 custNo 만 돌려준다. */
  async whoami(): Promise<{ custNo: string }> {
    const session = this.require();
    const raw = await this.http.get<RawUserInfo>("/common/bznsCom/user/searchUserInfo", {
      custNo: session.custNo,
    });
    // 응답이 비어 있으면 세션이 죽은 것으로 본다.
    if (raw === null || raw === undefined) {
      throw new CgvAuthError("세션이 만료된 것으로 보입니다.");
    }
    return { custNo: raw.custNo ?? session.custNo };
  }
}
