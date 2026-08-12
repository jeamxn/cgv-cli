/** 플로우 3단계: 상영 날짜 선택. */
import type { HttpTransport } from "../core/transport.ts";
import { toScreeningDate } from "../mappers/schedule.ts";
import type { ScreeningDate } from "../types/domain.ts";
import type { RawScreeningDay } from "../types/raw.ts";

export class DatesResource {
  private readonly http: HttpTransport;

  constructor(http: HttpTransport) {
    this.http = http;
  }

  /** 해당 극장에서 그 영화를 상영하는 날짜들 (오늘부터, 보통 14일). */
  async byMovieAndTheater(movieId: string, theaterId: string): Promise<ScreeningDate[]> {
    const raw = await this.http.get<readonly RawScreeningDay[]>(
      "/booking/searchSiteScnscYmdListByMov",
      { siteNo: theaterId, movNo: movieId },
    );
    return raw.map(toScreeningDate);
  }

  /** 전체 예매 오픈 마지막 날. 달력 상한을 그릴 때 쓴다. */
  async last(): Promise<string | null> {
    const raw = await this.http.get<readonly RawScreeningDay[]>("/booking/searchLastScnDay");
    return raw[0]?.scnYmd ?? null;
  }
}
