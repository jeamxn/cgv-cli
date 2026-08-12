export { CgvClient, type CgvClientOptions } from "./client.ts";

export { DEFAULT_CONFIG, RATING_NAMES, RTCTL_SCOPE_WEB, type CgvConfig } from "./core/config.ts";
export {
  CgvApiError,
  CgvAuthError,
  CgvBlockedError,
  CgvConfirmationRequiredError,
  CgvError,
  CgvNetworkError,
} from "./core/errors.ts";
export { FetchTransport, type HttpTransport, type Query } from "./core/transport.ts";
export { CookieJar } from "./core/cookie-jar.ts";
export { encryptPassword } from "./core/crypto.ts";
export { CgvLoginError, LoginFlow } from "./core/login.ts";
export {
  FileSessionStore,
  MemorySessionStore,
  maskSecret,
  normalizeCookieHeader,
  type Session,
  type SessionStore,
} from "./core/session.ts";

export { AuthResource } from "./resources/auth.ts";
export {
  SeatsResource,
  type SeatHold,
  type SeatRef,
  type SeatSpec,
  type ShowKey,
} from "./resources/seats.ts";
export { IdentityResource, type Identity } from "./resources/identity.ts";
export { CheckoutResource, type CheckoutResult } from "./resources/checkout.ts";
export {
  PaymentResource,
  TOSS_PAY,
  type PaymentIdentity,
  type PaymentPrepareInput,
  type TossApprovalState,
  type TossPaymentTicket,
} from "./resources/payment.ts";

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
