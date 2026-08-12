/** 플로우 1단계: 예매 가능한 영화 목록. */
import type { HttpTransport } from "../core/transport.ts";
import { toMovie, toMovieAttribute } from "../mappers/movie.ts";
import type { Movie, MovieAttribute } from "../types/domain.ts";
import type { RawMovie, RawMovieAttribute } from "../types/raw.ts";

export interface MovieListOptions {
  /** 제목 부분검색 (movNm) */
  readonly keyword?: string;
  /** 상영속성 필터 (attrCd, 예: "08" = SCREENX) */
  readonly attributeCode?: string;
}

export class MoviesResource {
  private readonly http: HttpTransport;

  constructor(http: HttpTransport) {
    this.http = http;
  }

  /** 예매율 내림차순으로 정렬된 예매 가능 영화 목록. */
  async list(options: MovieListOptions = {}): Promise<Movie[]> {
    const raw = await this.http.get<readonly RawMovie[]>("/booking/searchAtktTopPostrList", {
      movNm: options.keyword ?? "",
      div: "",
      attrCd: options.attributeCode ?? "",
    });
    return raw.map(toMovie);
  }

  /** IMAX / SCREENX 등 필터용 상영속성 목록. */
  async attributes(): Promise<MovieAttribute[]> {
    const raw = await this.http.get<readonly RawMovieAttribute[]>(
      "/booking/searchAtktTopPostrAttrList",
    );
    return raw.map(toMovieAttribute);
  }

  /** 제목으로 첫 일치 영화를 찾는다. 없으면 null. */
  async findByTitle(title: string): Promise<Movie | null> {
    const movies = await this.list({ keyword: title });
    return movies[0] ?? null;
  }
}
