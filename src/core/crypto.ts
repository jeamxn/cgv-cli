/**
 * CJ ONE 로그인 비밀번호 암호화 (RSA-OAEP).
 *
 * CGV 프론트엔드 번들(_next/static/chunks/3043-*.js)에서 확인한 스킴:
 *   - 공개키: 번들에 하드코딩된 RSA-2048 (아래 PUBLIC_KEY)
 *   - scheme: pkcs1_oaep
 *   - OAEP hash(lHash/seed): SHA-256
 *   - MGF1 hash: **SHA-1**  ← 비표준 조합
 *
 * Node 의 crypto.publicEncrypt 는 oaepHash 하나로 OAEP 와 MGF1 을 동시에 지정하므로
 * 이 조합을 표현할 수 없다. 그래서 EME-OAEP(RFC 8017 §7.1.1)를 직접 구현한다.
 * node-forge 를 넣으면 간단하지만 런타임 의존성 0 원칙을 깨므로 택하지 않았다.
 *
 * 검증(2026-08-12): 존재하지 않는 아이디로 대조 실험.
 *   - 이 구현의 암호문 → statusCode -1005 "ID 혹은 비밀번호가 일치하지 않습니다" (복호화 성공)
 *   - 무작위 256바이트  → Internal Server Error (복호화 실패)
 */
import { createHash, createPublicKey, randomBytes } from "node:crypto";

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA80imInbgn0MWltKh38+g
j2cm5Fsz/Gp2jxXnF6wv9CVTTjYil2Ai//6/YNwOfb9Dn7KHxuNeTT5vjvYzuHYl
Ws4DgwKiHblH+GMEnW9p/Fh1oQy4yOSTtgpb3aMEDmGhZ9fw2lLnXc7MiqLZG1Ny
RGlnHqlIq68iApu25ZlrqXH8Jdp+2qIc2bZnNGqEJMGNYRl3Ywkttg9L1tboXawL
Szu+i1bXmWRT1YnXJekbgsT6gwAVx3m1iV3xBZyJB/zxvzreboFGmuNVYyqkZzPe
5/R0t/JHjbMNxUg4PQQCiYVDlwk+EPiNubF+TZ6lzkkYa/21Qjgm/r8rW4phxsu5
HwIDAQAB
-----END PUBLIC KEY-----`;

/** OAEP seed/lHash 길이 (SHA-256) */
const H_LEN = 32;

/** MGF1 (RFC 8017 B.2.1) — CGV 는 SHA-1 을 쓴다. */
function mgf1Sha1(seed: Buffer, length: number): Buffer {
  const blocks: Buffer[] = [];
  for (let counter = 0, produced = 0; produced < length; counter += 1) {
    const c = Buffer.alloc(4);
    c.writeUInt32BE(counter, 0);
    const digest = createHash("sha1").update(Buffer.concat([seed, c])).digest();
    blocks.push(digest);
    produced += digest.length;
  }
  return Buffer.concat(blocks).subarray(0, length);
}

function xor(a: Buffer, b: Buffer): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] ?? 0) ^ (b[i] ?? 0);
  return out;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

interface PublicKeyParts {
  readonly n: bigint;
  readonly e: bigint;
  /** 모듈러스 바이트 길이 */
  readonly k: number;
}

let cached: PublicKeyParts | null = null;

function keyParts(): PublicKeyParts {
  if (cached !== null) return cached;
  const jwk = createPublicKey(PUBLIC_KEY).export({ format: "jwk" }) as {
    n: string;
    e: string;
  };
  const nBytes = Buffer.from(jwk.n, "base64url");
  cached = {
    n: BigInt(`0x${nBytes.toString("hex")}`),
    e: BigInt(`0x${Buffer.from(jwk.e, "base64url").toString("hex")}`),
    k: nBytes.length,
  };
  return cached;
}

/**
 * 로그인 폼의 비밀번호를 CGV 서버가 기대하는 형식(base64)으로 암호화한다.
 *
 * 프론트엔드 코드(chunk 305)의 실제 구성:
 *   password: rsa.encrypt( CryptoJS.enc.Hex.stringify( CryptoJS.SHA256(원문) ) )
 *
 * 즉 **원문이 아니라 SHA-256 hex 다이제스트(64자)** 를 RSA 로 감싼다.
 * 원문을 그대로 암호화하면 서버가 복호화에는 성공하지만 비밀번호가 불일치한다.
 *
 * 평문은 이 함수 밖으로 나가지 않으며 어디에도 보관하지 않는다.
 */
export function encryptPassword(plain: string): string {
  const { n, e, k } = keyParts();
  // 1단계: SHA-256 hex (소문자 64자)
  const digest = createHash("sha256").update(plain, "utf8").digest("hex");
  // 2단계: RSA-OAEP
  const message = Buffer.from(digest, "utf8");

  const maxLen = k - 2 * H_LEN - 2;
  if (message.length > maxLen) {
    throw new Error(`비밀번호가 너무 깁니다 (최대 ${maxLen}바이트).`);
  }

  // DB = lHash || PS || 0x01 || M
  const lHash = createHash("sha256").update("").digest();
  const padding = Buffer.alloc(maxLen - message.length, 0);
  const db = Buffer.concat([lHash, padding, Buffer.from([0x01]), message]);

  const seed = randomBytes(H_LEN);
  const maskedDb = xor(db, mgf1Sha1(seed, k - H_LEN - 1));
  const maskedSeed = xor(seed, mgf1Sha1(maskedDb, H_LEN));

  // EM = 0x00 || maskedSeed || maskedDB
  const em = Buffer.concat([Buffer.from([0x00]), maskedSeed, maskedDb]);
  const cipher = modPow(BigInt(`0x${em.toString("hex")}`), e, n);

  return Buffer.from(cipher.toString(16).padStart(k * 2, "0"), "hex").toString("base64");
}
