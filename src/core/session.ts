/**
 * 로그인 세션 저장소.
 *
 * 왜 비밀번호를 다루지 않는가:
 * CJ ONE SSO 는 비밀번호를 RSA 로 암호화해 전송하고, 공개키 발급 경로가 확인되지 않았다.
 * 대신 브라우저에서 로그인한 뒤 쿠키를 주입받는다. 자격증명을 저장하지 않으므로
 * 유출 위험이 근본적으로 줄어든다.
 *
 * 파일은 0600 으로 저장한다. 저장소에 커밋하면 안 된다.
 */
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Session {
  /** CGV 고객번호. 로그인 이후 대부분의 API 가 요구한다. */
  readonly custNo: string;
  /** Cookie 헤더에 그대로 실을 문자열 */
  readonly cookie: string;
  /** 저장 시각 (ISO) */
  readonly savedAt: string;
}

export interface SessionStore {
  load(): Session | null;
  save(session: Session): void;
  clear(): void;
  location(): string;
}

const DEFAULT_PATH = join(homedir(), ".cgv-cli", "session.json");

export class FileSessionStore implements SessionStore {
  private readonly path: string;

  constructor(path: string = DEFAULT_PATH) {
    this.path = path;
  }

  location(): string {
    return this.path;
  }

  load(): Session | null {
    let text: string;
    try {
      text = readFileSync(this.path, "utf8");
    } catch {
      return null;
    }

    try {
      const parsed = JSON.parse(text) as Partial<Session>;
      if (typeof parsed.custNo !== "string" || typeof parsed.cookie !== "string") return null;
      return {
        custNo: parsed.custNo,
        cookie: parsed.cookie,
        savedAt: parsed.savedAt ?? "unknown",
      };
    } catch {
      return null;
    }
  }

  save(session: Session): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
    // 이미 존재하던 파일은 writeFileSync 의 mode 가 적용되지 않으므로 명시적으로 조인다.
    chmodSync(this.path, 0o600);
  }

  clear(): void {
    rmSync(this.path, { force: true });
  }
}

/** 메모리 전용. 테스트나 일회성 실행에 쓴다. */
export class MemorySessionStore implements SessionStore {
  private session: Session | null = null;

  location(): string {
    return "(memory)";
  }
  load(): Session | null {
    return this.session;
  }
  save(session: Session): void {
    this.session = session;
  }
  clear(): void {
    this.session = null;
  }
}

/**
 * 브라우저에서 복사한 Cookie 헤더 문자열에서 CGV 세션에 필요한 쿠키만 남긴다.
 * 광고/분석 쿠키를 걸러 요청 크기와 노출을 줄인다.
 */
const KEEP_PREFIXES = ["SESSION", "JSESSIONID", "CGV", "cgv", "__cf_bm", "_cfuvid", "ssoCheckYn"];

export function normalizeCookieHeader(raw: string): string {
  const kept: string[] = [];
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const name = trimmed.slice(0, trimmed.indexOf("="));
    if (name === "") continue;
    if (KEEP_PREFIXES.some((prefix) => name.startsWith(prefix))) kept.push(trimmed);
  }
  // 판별 못한 경우는 원문을 그대로 쓴다 (쿠키 이름이 바뀌었을 수 있으므로 실패보다 낫다).
  return kept.length > 0 ? kept.join("; ") : raw.trim();
}

/** 로그에 찍어도 되는 형태로 줄인다. */
export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible) return "*".repeat(value.length);
  return `${value.slice(0, visible)}${"*".repeat(Math.min(12, value.length - visible))}`;
}
