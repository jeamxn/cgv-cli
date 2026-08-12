/**
 * 메모리 쿠키 자. 단일 책임: Set-Cookie 를 파싱해 보관하고 Cookie 헤더를 만든다.
 *
 * __cf_bm 은 Cloudflare 가 홈 문서 응답에 심어주는 봇 관리 쿠키이며 약 30분 만료다.
 * Domain/Path 는 다루지 않는다 — 이 클라이언트는 cgv.co.kr 단일 호스트만 호출한다.
 */

interface StoredCookie {
  readonly value: string;
  /** epoch ms. null 이면 세션 쿠키(만료 없음) */
  readonly expiresAt: number | null;
}

export class CookieJar {
  private readonly jar = new Map<string, StoredCookie>();

  /** fetch Response 의 Set-Cookie 배열을 흡수한다. */
  absorb(setCookieHeaders: readonly string[]): void {
    for (const raw of setCookieHeaders) {
      const parsed = parseSetCookie(raw);
      if (parsed === null) continue;

      // 값이 비었거나 과거 만료 → 삭제 지시
      if (parsed.value === "" || (parsed.expiresAt !== null && parsed.expiresAt <= Date.now())) {
        this.jar.delete(parsed.name);
        continue;
      }
      this.jar.set(parsed.name, { value: parsed.value, expiresAt: parsed.expiresAt });
    }
  }

  /** 유효한 쿠키만 모아 Cookie 헤더 값을 만든다. 없으면 null. */
  header(): string | null {
    const parts: string[] = [];
    for (const [name, cookie] of this.jar) {
      if (this.isExpired(name, cookie)) continue;
      parts.push(`${name}=${cookie.value}`);
    }
    return parts.length > 0 ? parts.join("; ") : null;
  }

  /** 해당 쿠키가 살아있는지. (예: has("__cf_bm")) */
  has(name: string): boolean {
    const cookie = this.jar.get(name);
    if (cookie === undefined) return false;
    return !this.isExpired(name, cookie);
  }

  clear(): void {
    this.jar.clear();
  }

  private isExpired(name: string, cookie: StoredCookie): boolean {
    if (cookie.expiresAt === null) return false;
    if (cookie.expiresAt > Date.now()) return false;
    this.jar.delete(name);
    return true;
  }
}

interface ParsedCookie {
  readonly name: string;
  readonly value: string;
  readonly expiresAt: number | null;
}

function parseSetCookie(raw: string): ParsedCookie | null {
  const segments = raw.split(";");
  const pair = segments[0];
  if (pair === undefined) return null;

  const eq = pair.indexOf("=");
  if (eq <= 0) return null;

  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (name === "") return null;

  // Max-Age 가 Expires 보다 우선 (RFC 6265)
  let expiresFromMaxAge: number | null = null;
  let expiresFromExpires: number | null = null;

  for (const segment of segments.slice(1)) {
    const attrEq = segment.indexOf("=");
    const key = (attrEq === -1 ? segment : segment.slice(0, attrEq)).trim().toLowerCase();
    const attrValue = attrEq === -1 ? "" : segment.slice(attrEq + 1).trim();

    if (key === "max-age") {
      const seconds = Number(attrValue);
      if (Number.isFinite(seconds)) expiresFromMaxAge = Date.now() + seconds * 1000;
    } else if (key === "expires") {
      const parsed = Date.parse(attrValue);
      if (!Number.isNaN(parsed)) expiresFromExpires = parsed;
    }
  }

  return { name, value, expiresAt: expiresFromMaxAge ?? expiresFromExpires };
}
