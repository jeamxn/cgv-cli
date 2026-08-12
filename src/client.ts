/**
 * 유일한 조립(composition) 지점. 리소스들은 서로를 모르고 transport 만 공유한다.
 * 예외적으로 seats/payment 는 auth 에 의존한다 — 로그인 세션 없이는 성립하지 않는 작업이라
 * 호출 시점이 아니라 조립 시점에 의존을 드러내는 편이 안전하다.
 */
import { DEFAULT_CONFIG, type CgvConfig } from "./core/config.ts";
import { FetchTransport, type HttpTransport } from "./core/transport.ts";
import { FileSessionStore, type SessionStore } from "./core/session.ts";
import { DatesResource } from "./resources/dates.ts";
import { MoviesResource } from "./resources/movies.ts";
import { SchedulesResource } from "./resources/schedules.ts";
import { TheatersResource } from "./resources/theaters.ts";
import { AuthResource } from "./resources/auth.ts";
import { SeatsResource } from "./resources/seats.ts";
import { PaymentResource } from "./resources/payment.ts";

export interface CgvClientOptions {
  /** 일부만 넘겨도 나머지는 DEFAULT_CONFIG 로 채운다. */
  readonly config?: Partial<CgvConfig>;
  /** 테스트/모킹용 transport 주입. 주면 config 는 무시된다. */
  readonly transport?: HttpTransport;
  /** 세션 저장소. 기본은 ~/.cgv-cli/session.json */
  readonly sessions?: SessionStore;
}

export class CgvClient {
  readonly movies: MoviesResource;
  readonly theaters: TheatersResource;
  readonly dates: DatesResource;
  readonly schedules: SchedulesResource;
  readonly auth: AuthResource;
  readonly seats: SeatsResource;
  readonly payment: PaymentResource;

  constructor(options: CgvClientOptions = {}) {
    const sessions = options.sessions ?? new FileSessionStore();
    const http =
      options.transport ??
      new FetchTransport({ ...DEFAULT_CONFIG, ...options.config }, sessions);

    this.movies = new MoviesResource(http);
    this.theaters = new TheatersResource(http);
    this.dates = new DatesResource(http);
    this.schedules = new SchedulesResource(http);

    this.auth = new AuthResource(http, sessions);
    this.seats = new SeatsResource(http, this.auth);
    this.payment = new PaymentResource(http, this.auth);
  }
}
