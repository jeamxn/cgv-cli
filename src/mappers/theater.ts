import type { Region, Theater } from "../types/domain.ts";
import type { RawAllRegionAndSite, RawRegion, RawSite } from "../types/raw.ts";
import { toNumber } from "./primitives.ts";

export function toTheater(raw: RawSite): Theater {
  return {
    id: raw.siteNo,
    name: raw.siteNm,
    operating: raw.bzplcOperStusNm === "운영중",
  };
}

/** searchRegnList (영화별 상영 지역) → Region[] */
export function toRegionFromScheduled(raw: RawRegion): Region {
  return {
    code: raw.regnGrpCd,
    name: raw.regnGrpNm,
    scheduleCount: toNumber(raw.schdCnt),
    theaters: raw.siteList.map(toTheater),
  };
}

/**
 * searchAllRegionAndSite (전체 극장) → Region[]
 * 지역과 극장이 분리된 평면 응답이라 regnGrpCd 로 조립한다.
 */
export function toRegionsFromCatalog(raw: RawAllRegionAndSite): Region[] {
  const byRegion = new Map<string, Theater[]>();
  for (const site of raw.siteInfo) {
    const theater: Theater = { id: site.siteNo, name: site.siteNm, operating: true };
    const bucket = byRegion.get(site.regnGrpCd);
    if (bucket === undefined) byRegion.set(site.regnGrpCd, [theater]);
    else bucket.push(theater);
  }

  return raw.regionInfo.map((region) => ({
    code: region.comCdval,
    name: region.comCdvalNm,
    scheduleCount: null,
    theaters: byRegion.get(region.comCdval) ?? [],
  }));
}
