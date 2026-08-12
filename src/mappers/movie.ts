import { RATING_NAMES } from "../core/config.ts";
import type { Movie, MovieAttribute } from "../types/domain.ts";
import type { RawMovie, RawMovieAttribute } from "../types/raw.ts";
import { toNumber } from "./primitives.ts";

/** 포스터 파일명만 오므로 CDN 베이스를 붙여 완전한 URL 로 만든다. */
const POSTER_BASE = "https://img.cgv.co.kr/Movie/Thumbnail/Poster";

export function toMovie(raw: RawMovie): Movie {
  return {
    id: raw.movNo,
    title: raw.movNm,
    runtimeMinutes: toNumber(raw.scnBssTm),
    bookingRate: toNumber(raw.atktRate),
    ratingCode: raw.cratgClsCd,
    rating: RATING_NAMES[raw.cratgClsCd] ?? raw.cratgClsCd,
    posterUrl: raw.i320Fnm === null ? null : `${POSTER_BASE}/${raw.i320Fnm}`,
  };
}

export function toMovieAttribute(raw: RawMovieAttribute): MovieAttribute {
  return { code: raw.attrCd, name: raw.attrNm, group: raw.div };
}
