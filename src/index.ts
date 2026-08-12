export { CgvClient, type CgvClientOptions } from "./client.ts";

export { DEFAULT_CONFIG, RATING_NAMES, RTCTL_SCOPE_WEB, type CgvConfig } from "./core/config.ts";
export { CgvApiError, CgvBlockedError, CgvError, CgvNetworkError } from "./core/errors.ts";
export { FetchTransport, type HttpTransport, type Query } from "./core/transport.ts";
export { CookieJar } from "./core/cookie-jar.ts";

export { todayInSeoul } from "./mappers/primitives.ts";
export { groupByScreen } from "./mappers/schedule.ts";

export type { MovieListOptions } from "./resources/movies.ts";

export type {
  Movie,
  MovieAttribute,
  Region,
  ScheduleQuery,
  ScreenSchedule,
  ScreeningDate,
  Showtime,
  ShowtimeQuery,
  Theater,
} from "./types/domain.ts";

export type * from "./types/raw.ts";
