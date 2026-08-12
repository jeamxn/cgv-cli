/** 플로우 2단계: 영화관(지역/극장) 선택. */
import type { HttpTransport } from "../core/transport.ts";
import { toRegionFromScheduled, toRegionsFromCatalog } from "../mappers/theater.ts";
import type { Region, Theater } from "../types/domain.ts";
import type { RawAllRegionAndSite, RawRegion } from "../types/raw.ts";

export class TheatersResource {
  private readonly http: HttpTransport;

  constructor(http: HttpTransport) {
    this.http = http;
  }

  /** 특정 영화를 상영하는 지역 + 극장. scheduleCount 로 상영 규모를 알 수 있다. */
  async byMovie(movieId: string): Promise<Region[]> {
    const raw = await this.http.get<readonly RawRegion[]>("/booking/searchRegnList", {
      movNo: movieId,
    });
    return raw.map(toRegionFromScheduled);
  }

  /** 영화와 무관한 전체 극장 카탈로그. */
  async all(): Promise<Region[]> {
    const raw = await this.http.get<RawAllRegionAndSite>("/content/site/searchAllRegionAndSite");
    return toRegionsFromCatalog(raw);
  }

  /**
   * 극장명으로 검색. movieId 를 주면 "그 영화를 상영하는 극장"만 대상으로 하고,
   * 생략하면 전체 카탈로그에서 찾는다.
   */
  async findByName(name: string, movieId?: string): Promise<Theater | null> {
    const regions = movieId === undefined ? await this.all() : await this.byMovie(movieId);
    for (const region of regions) {
      const hit = region.theaters.find((theater) => theater.name.includes(name));
      if (hit !== undefined) return hit;
    }
    return null;
  }
}
