/**
 * 유일한 조립(composition) 지점. 리소스들은 서로를 모르고 transport 만 공유한다.
 */
import { DEFAULT_CONFIG, type CgvConfig } from "./core/config.ts";
import { FetchTransport, type HttpTransport } from "./core/transport.ts";
import { DatesResource } from "./resources/dates.ts";
import { MoviesResource } from "./resources/movies.ts";
import { SchedulesResource } from "./resources/schedules.ts";
import { TheatersResource } from "./resources/theaters.ts";

export interface CgvClientOptions {
  /** 일부만 넘겨도 나머지는 DEFAULT_CONFIG 로 채운다. */
  readonly config?: Partial<CgvConfig>;
  /** 테스트/모킹용 transport 주입. 주면 config 는 무시된다. */
  readonly transport?: HttpTransport;
}

export class CgvClient {
  readonly movies: MoviesResource;
  readonly theaters: TheatersResource;
  readonly dates: DatesResource;
  readonly schedules: SchedulesResource;

  constructor(options: CgvClientOptions = {}) {
    const http = options.transport ?? new FetchTransport({ ...DEFAULT_CONFIG, ...options.config });

    this.movies = new MoviesResource(http);
    this.theaters = new TheatersResource(http);
    this.dates = new DatesResource(http);
    this.schedules = new SchedulesResource(http);
  }
}
