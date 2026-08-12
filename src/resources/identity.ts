/**
 * 결제 페이로드에 실을 신원 블록을 만든다.
 *
 * CGV 는 결제 요청에서 이름·연락처를 AES 로 감싼 값으로 주고받는다.
 * 키는 클라이언트에 없으므로 **서버가 준 암호문을 그대로 되돌려 보낸다**(pass-through).
 * 실측상 이 암호문은 결정론적이라 조회 시점이 달라도 값이 동일하다.
 */
import type { HttpTransport } from "../core/transport.ts";
import type { AuthResource } from "./auth.ts";
import type { RawUserInfo } from "../types/raw-booking.ts";

/** paymInfoCont 의 cust 블록. 값 대부분이 암호문이라 해석하지 않는다. */
export interface EncryptedCust {
  readonly coCd: string;
  readonly userId: string;
  readonly userNo: string;
  readonly userName: string;
  readonly userCellPhone: string;
  readonly userEmail: string;
  readonly cusgdCd: string;
  readonly ipinCntcNo: string;
  readonly custNo: string;
  readonly itgrCustNo: string;
}

export interface Identity {
  readonly cust: EncryptedCust;
  /** PG 에 넘길 평문 휴대폰 번호. 결제 인증 문자 발송에 쓰인다. */
  readonly phone: string;
  /** CJ ONE 통합 회원번호 */
  readonly itgrCustNo: string;
  /**
   * 결제번호 발급(commonGetPayId 1차)은 평문 아이디/이름을 요구한다.
   * 같은 값을 암호문으로 보내면 400 이 난다 — 저장(2차)과 규칙이 다르다.
   */
  readonly plainUserId: string;
  readonly plainUserName: string;
}

interface RawAgreeUser {
  readonly itgrCustNo?: string;
  readonly telNo?: string;
  readonly icustId?: string;
  readonly custNm?: string;
  readonly [key: string]: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export class IdentityResource {
  private readonly http: HttpTransport;
  private readonly auth: AuthResource;
  /** 한 번의 실행에서 두 번 조회할 이유가 없다. */
  private cached: Identity | null = null;

  constructor(http: HttpTransport, auth: AuthResource) {
    this.http = http;
    this.auth = auth;
  }

  async resolve(): Promise<Identity> {
    if (this.cached !== null) return this.cached;
    const session = this.auth.require();

    const [info, agree] = await Promise.all([
      this.http.get<RawUserInfo>("/common/bznsCom/user/searchUserInfo", {
        custNo: session.custNo,
      }),
      this.http.post<RawAgreeUser>("/member/usgStpl/searchMemAgreeUser", { coCd: "A420" }),
    ]);

    const itgrCustNo = text(agree?.itgrCustNo);
    const phone = text(agree?.telNo);
    if (phone === "") {
      throw new Error("휴대폰 번호를 조회하지 못했습니다. 세션이 만료되었을 수 있습니다.");
    }

    // userCellPhone 은 전체번호를 통으로 감싼 암호문이라 3분할(pmblNo/fmblNo/tmblNo)로는
    // 재구성할 수 없다. 서버가 따로 주지 않으므로 빈 값으로 둔다.
    this.cached = {
      cust: {
        coCd: "A420",
        userId: text(info?.userId),
        userNo: session.custNo,
        userName: text(info?.custNm),
        userCellPhone: "",
        userEmail: text(info?.userEmail),
        cusgdCd: text(info?.cusgdCd) === "" ? "01" : text(info?.cusgdCd),
        ipinCntcNo: text(info?.ipinCntcNo),
        custNo: session.custNo,
        itgrCustNo,
      },
      phone,
      itgrCustNo,
      plainUserId: text(agree?.icustId),
      plainUserName: text(agree?.custNm),
    };
    return this.cached;
  }
}
