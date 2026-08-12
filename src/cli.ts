#!/usr/bin/env node
/**
 * CLI 엔트리. 라이브러리는 CLI 를 모르고, CLI 만 라이브러리를 안다.
 * 명령 추가는 COMMANDS 레지스트리에 항목을 더하는 것으로 끝난다(OCP).
 */
import { CgvClient } from "./client.ts";
import { CgvConfirmationRequiredError, CgvError } from "./core/errors.ts";
import { maskSecret } from "./core/session.ts";
import { todayInSeoul } from "./mappers/primitives.ts";
import { renderTable, type Column } from "./cli/table.ts";
import type { SeatSpec, ShowKey } from "./resources/seats.ts";
import type { Movie, ScreenSchedule, Showtime, Theater } from "./types/domain.ts";

interface Args {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | true>>;
}

function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i += 1;
    } else {
      flags[name] = true;
    }
  }
  return { positional, flags };
}

/** 인자가 숫자 ID 형태가 아니면 제목으로 보고 검색한다. */
async function resolveMovieId(client: CgvClient, token: string): Promise<string> {
  if (/^\d+$/.test(token)) return token;
  const movie = await client.movies.findByTitle(token);
  if (movie === null) throw new Error(`영화를 찾을 수 없습니다: ${token}`);
  process.stderr.write(`영화: ${movie.title} (${movie.id})\n`);
  return movie.id;
}

async function resolveTheaterId(
  client: CgvClient,
  token: string,
  movieId: string,
): Promise<string> {
  // 극장번호는 "0013" / "P001" 처럼 4자리 코드다.
  if (/^[0-9A-Z]{4}$/.test(token)) return token;
  const theater = await client.theaters.findByName(token, movieId);
  if (theater === null) throw new Error(`극장을 찾을 수 없습니다: ${token}`);
  process.stderr.write(`극장: ${theater.name} (${theater.id})\n`);
  return theater.id;
}

const MOVIE_COLUMNS: readonly Column<Movie>[] = [
  { header: "ID", value: (m) => m.id },
  { header: "제목", value: (m) => m.title },
  { header: "등급", value: (m) => m.rating },
  { header: "상영시간", value: (m) => `${m.runtimeMinutes}분`, align: "right" },
  { header: "예매율", value: (m) => `${m.bookingRate.toFixed(2)}%`, align: "right" },
];

const SHOWTIME_COLUMNS: readonly Column<Showtime>[] = [
  { header: "회차", value: (s) => s.sequence, align: "right" },
  { header: "시작", value: (s) => s.startTime },
  { header: "종료", value: (s) => s.endTime },
  { header: "포맷", value: (s) => s.format },
  { header: "잔여", value: (s) => String(s.remainingSeats), align: "right" },
  { header: "판매가능", value: (s) => String(s.sellableSeats), align: "right" },
  {
    header: "점유율",
    value: (s) => (s.occupancyRate === null ? "-" : `${(s.occupancyRate * 100).toFixed(1)}%`),
    align: "right",
  },
  { header: "예매", value: (s) => (s.bookable ? "가능" : "불가") },
];

function printScreens(screens: readonly ScreenSchedule[]): void {
  for (const screen of screens) {
    process.stdout.write(
      `\n${screen.theaterName} [${screen.screenId}] ${screen.screenDisplayName}  ` +
        `총 ${screen.totalSeats}석 / 잔여합 ${screen.remainingSeatsTotal}석\n`,
    );
    process.stdout.write(`${renderTable(screen.showtimes, SHOWTIME_COLUMNS)}\n`);
  }
}

type Handler = (client: CgvClient, args: Args) => Promise<void>;

interface Command {
  readonly usage: string;
  readonly description: string;
  readonly run: Handler;
}

const COMMANDS: Readonly<Record<string, Command>> = {
  movies: {
    usage: "cgv movies [--keyword <제목>]",
    description: "예매 가능한 영화 목록",
    run: async (client, args) => {
      const keyword = args.flags["keyword"];
      const movies = await client.movies.list(typeof keyword === "string" ? { keyword } : {});
      emit(args, movies, () => renderTable(movies, MOVIE_COLUMNS));
    },
  },

  theaters: {
    usage: "cgv theaters <영화ID|제목>",
    description: "해당 영화를 상영하는 지역/극장",
    run: async (client, args) => {
      const movieId = await resolveMovieId(client, required(args, 0, "영화ID 또는 제목"));
      const regions = await client.theaters.byMovie(movieId);

      emit(args, regions, () =>
        regions
          .map((region) => {
            const rows: readonly Theater[] = region.theaters;
            const header = `\n[${region.code}] ${region.name} (스케줄 ${region.scheduleCount ?? "-"}건)`;
            const table = renderTable(rows, [
              { header: "극장ID", value: (t) => t.id },
              { header: "극장명", value: (t) => t.name },
              { header: "운영", value: (t) => (t.operating ? "O" : "X") },
            ]);
            return `${header}\n${table}`;
          })
          .join("\n"),
      );
    },
  },

  dates: {
    usage: "cgv dates <영화ID|제목> <극장ID|극장명>",
    description: "해당 극장의 상영 날짜 목록",
    run: async (client, args) => {
      const movieId = await resolveMovieId(client, required(args, 0, "영화ID 또는 제목"));
      const theaterId = await resolveTheaterId(
        client,
        required(args, 1, "극장ID 또는 극장명"),
        movieId,
      );
      const dates = await client.dates.byMovieAndTheater(movieId, theaterId);
      emit(args, dates, () =>
        dates.map((d) => `${d.date}${d.isHoliday ? "  (휴일)" : ""}`).join("\n"),
      );
    },
  },

  seats: {
    usage: "cgv seats <영화ID|제목> <극장ID|극장명> [YYYYMMDD]",
    description: "상영관별 회차 + 잔여좌석 (기본: 오늘)",
    run: async (client, args) => {
      const movieId = await resolveMovieId(client, required(args, 0, "영화ID 또는 제목"));
      const theaterId = await resolveTheaterId(
        client,
        required(args, 1, "극장ID 또는 극장명"),
        movieId,
      );
      const date = args.positional[2] ?? todayInSeoul();

      const screens = await client.schedules.byScreen({ movieId, theaterId, date });
      if (screens.length === 0) {
        process.stderr.write(`${date} 상영 스케줄이 없습니다.\n`);
        return;
      }

      if (args.flags["json"] === true) {
        process.stdout.write(`${JSON.stringify(screens, null, 2)}\n`);
        return;
      }

      const movieTitle = screens[0]?.showtimes[0]?.movieTitle ?? movieId;
      process.stdout.write(`${movieTitle} / ${date} / 극장 ${theaterId}\n`);
      printScreens(screens);
    },
  },

  // ── 로그인 필요 구간 ─────────────────────────────────────────

  login: {
    usage: "cgv login <아이디>            (비밀번호는 입력 프롬프트 또는 CGV_PASSWORD)",
    description: "아이디/비밀번호 로그인 (RSA-OAEP). --cookie 로 세션 주입도 가능",
    run: async (client, args) => {
      const cookie = args.flags["cookie"];

      // 방식 2: 브라우저 세션 쿠키 주입 (`cgv login <custNo> --cookie '...'`)
      if (typeof cookie === "string") {
        const custNo = required(args, 0, "custNo");
        const session = await client.auth.adopt(cookie, custNo);
        process.stdout.write(
          `세션 주입 완료: custNo=${session.custNo}, cookie=${maskSecret(session.cookie)}\n`,
        );
        return;
      }

      // 방식 1: 아이디/비밀번호
      const userId = required(args, 0, "아이디");
      const password = await readPassword();
      if (password === "") throw new Error("비밀번호가 비어 있습니다.");

      const session = await client.auth.login(userId, password);
      process.stdout.write(
        `로그인 완료: custNo=${session.custNo}, cookie=${maskSecret(session.cookie)}\n`,
      );
    },
  },

  whoami: {
    usage: "cgv whoami",
    description: "현재 세션 확인",
    run: async (client, args) => {
      const me = await client.auth.whoami();
      emit(args, me, () => `custNo=${me.custNo}`);
    },
  },

  logout: {
    usage: "cgv logout",
    description: "저장된 세션 삭제",
    run: async (client) => {
      client.auth.logout();
      process.stdout.write("세션을 삭제했습니다.\n");
    },
  },

  seatmap: {
    usage: "cgv seatmap <영화ID> <극장ID> <YYYYMMDD> <상영관> <회차> [--area 001]",
    description: "좌석 배치도 원본 조회 (부수효과 없음)",
    run: async (client, args) => {
      const show = showKeyFrom(args, 0);
      const area = args.flags["area"];
      const data = await client.seats.layout(show, typeof area === "string" ? area : undefined);
      // 스키마 미확정이라 항상 JSON 으로 낸다.
      process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    },
  },

  hold: {
    usage: "cgv hold <영화ID> <극장ID> <YYYYMMDD> <상영관> <회차> <좌석> --confirm",
    description: "[부수효과] 좌석 선점. 좌석은 K8@00100100170021 형식",
    run: async (client, args) => {
      requireConfirm(args, "좌석 선점");
      const show = showKeyFrom(args, 0);
      const seats = await client.seats.resolve(show, parseSeatArgs(required(args, 5, "좌석")));

      const hold = await client.seats.hold(show, seats);
      process.stdout.write(
        `선점 완료\n  발권번호(movAtktNo): ${hold.movAtktNo}\n` +
          `  만료: ${hold.expiresAt ?? "(응답에서 확인 못함)"}\n` +
          `  좌석: ${seats.map((s) => `${s.row}${s.number}(${s.stkndNm})`).join(", ")}\n\n` +
          `취소하려면: cgv release ${hold.movAtktNo} ${args.positional.slice(0, 6).join(" ")} --confirm\n`,
      );
      if (args.flags["json"] === true) {
        process.stdout.write(`${JSON.stringify(hold, null, 2)}\n`);
      }
    },
  },

  release: {
    usage: "cgv release <movAtktNo> <영화ID> <극장ID> <YYYYMMDD> <상영관> <회차> <좌석> --confirm",
    description: "[부수효과] 좌석 선점 해제",
    run: async (client, args) => {
      requireConfirm(args, "좌석 선점 해제");
      const movAtktNo = required(args, 0, "movAtktNo");
      const show = showKeyFrom(args, 1);
      // 해제 대상은 이미 잡혀 있으므로 판매 여부 검사를 건너뛴다.
      const seats = await client.seats.resolve(show, parseSeatArgs(required(args, 6, "좌석")), {
        includeSold: true,
      });

      await client.seats.release({ movAtktNo, expiresAt: null, seats, show, raw: {} });
      process.stdout.write("선점을 해제했습니다.\n");
    },
  },

  paymethods: {
    usage: "cgv paymethods <극장ID>",
    description: "사용 가능한 결제수단 조회 (부수효과 없음)",
    run: async (client, args) => {
      const methods = await client.payment.methods(required(args, 0, "극장ID"));
      emit(args, methods, () =>
        renderTable(methods, [
          { header: "코드", value: (m) => String(m.paykndCd ?? "") },
          { header: "결제수단", value: (m) => String(m.paykndNm ?? "") },
          { header: "그룹", value: (m) => String(m.paymGrpClsNm ?? "") },
          { header: "노출", value: (m) => String(m.indctTgtYn ?? "") },
        ]),
      );
    },
  },

  terms: {
    usage: "cgv terms",
    description: "결제 약관 조회 (부수효과 없음)",
    run: async (client, args) => {
      const terms = await client.payment.terms();
      emit(args, terms, () =>
        terms
          .map((t) => `## ${t.stplTitNm ?? "(제목 없음)"}\n${String(t.stplCont ?? "").trim()}`)
          .join("\n\n"),
      );
    },
  },

  paystatus: {
    usage: "cgv paystatus <payToken>",
    description: "토스 결제 승인 상태 폴링 (부수효과 없음)",
    run: async (client, args) => {
      const token = required(args, 0, "payToken");
      const result = await client.payment.tossApprovalState(token);
      emit(args, result, () => `state=${result.state}`);
    },
  },

  checkout: {
    usage:
      "cgv checkout <영화ID> <극장ID> <YYYYMMDD> <상영관> <회차> <좌석> <movAtktNo> --confirm",
    description: "[부수효과] 선점한 좌석으로 결제 개시 → 토스 승인 URL 반환",
    run: async (client, args) => {
      requireConfirm(args, "결제 개시");

      const show = showKeyFrom(args, 0);
      // 결제 대상은 이미 선점된 좌석이므로 판매 여부 검사를 건너뛴다.
      const seats = await client.seats.resolve(show, parseSeatArgs(required(args, 5, "좌석")), {
        includeSold: true,
      });
      const movAtktNo = required(args, 6, "movAtktNo");

      process.stderr.write(
        `\n[확인] ${show.date} ${show.screenId}관 ${show.sequence}회차 / ` +
          `좌석 ${seats.map((s) => `${s.row}${s.number}`).join(", ")}\n` +
          `결제 절차를 실제로 개시합니다.\n\n`,
      );

      const result = await client.checkout.start({ show, seats, movAtktNo });
      const { ticket } = result;

      process.stdout.write(
        `${result.goodsName} / ${result.amount.toLocaleString("ko-KR")}원\n` +
          `결제번호: ${ticket.payment.paymNo}\n` +
          `PG 거래키: ${ticket.trxKey ?? "(응답에서 못 찾음)"}\n` +
          `승인 URL: ${ticket.approvalUrl ?? "(응답에서 못 찾음 — --json 으로 원본 확인)"}\n\n` +
          `다음 단계는 자동화할 수 없습니다:\n` +
          `  1) 위 URL 을 브라우저에서 열기\n` +
          `  2) 토스 앱에서 직접 결제 승인\n` +
          `  3) cgv paystatus <payToken> 으로 상태 확인\n`,
      );
      if (args.flags["json"] === true) {
        process.stdout.write(`${JSON.stringify(ticket, null, 2)}\n`);
      }
    },
  },
};

/**
 * 비밀번호를 읽는다. CLI 인자로는 절대 받지 않는다 — 셸 히스토리와
 * `ps` 출력에 평문이 남기 때문이다.
 * 우선순위: CGV_PASSWORD 환경변수 → TTY 프롬프트(에코 끔).
 */
async function readPassword(): Promise<string> {
  const fromEnv = process.env["CGV_PASSWORD"];
  if (typeof fromEnv === "string" && fromEnv !== "") return fromEnv;

  if (!process.stdin.isTTY) {
    throw new Error(
      "비밀번호를 읽을 수 없습니다. CGV_PASSWORD 환경변수를 쓰거나 터미널에서 실행하세요.\n" +
        "  (보안상 비밀번호는 명령행 인자로 받지 않습니다)",
    );
  }

  process.stderr.write("비밀번호: ");
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise<string>((resolve) => {
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      const char = chunk.toString("utf8");
      // Enter / Ctrl-C / Ctrl-D
      if (char === "\r" || char === "\n" || char === "\u0004") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stderr.write("\n");
        resolve(buffer);
        return;
      }
      if (char === "\u0003") {
        process.stdin.setRawMode(false);
        process.stderr.write("\n");
        process.exit(130);
      }
      if (char === "\u007f") {
        buffer = buffer.slice(0, -1);
        return;
      }
      buffer += char;
    };
    process.stdin.on("data", onData);
  });
}

/** 부수효과가 있는 작업은 --confirm 없이는 실행하지 않는다. */
function requireConfirm(args: Args, action: string): void {
  if (args.flags["confirm"] !== true) throw new CgvConfirmationRequiredError(action);
}

/** "K8,K9" 또는 "K8@00100100170021" 형식을 SeatRef 로 바꾼다. */
/**
 * 좌석 인자를 해석한다. 'K8' 또는 'K8@00100100170021' 둘 다 받는다.
 * 실제 좌석 속성(존·좌석종류)은 배치도에서 읽으므로 여기서는 식별자만 뽑는다.
 */
function parseSeatArgs(spec: string): SeatSpec[] {
  return spec.split(",").map((token) => {
    const [label, locNo] = token.trim().split("@");
    const matched = /^([A-Za-z]+)\s*(\d+)$/.exec(label ?? "");
    if (matched === null) {
      throw new Error(`좌석 형식이 잘못됐습니다: '${token}' (예: K8 또는 K8@00100100170021)`);
    }
    return {
      row: (matched[1] ?? "").toUpperCase(),
      number: matched[2] ?? "",
      ...(locNo === undefined ? {} : { seatLocNo: locNo }),
    };
  });
}

function showKeyFrom(args: Args, offset: number): ShowKey {
  return {
    movieId: required(args, offset, "영화ID"),
    theaterId: required(args, offset + 1, "극장ID"),
    date: required(args, offset + 2, "날짜(YYYYMMDD)"),
    screenId: required(args, offset + 3, "상영관번호"),
    sequence: required(args, offset + 4, "회차"),
  };
}

function required(args: Args, index: number, label: string): string {
  const value = args.positional[index];
  if (value === undefined) throw new Error(`${label} 인자가 필요합니다.`);
  return value;
}

function emit(args: Args, data: unknown, render: () => string): void {
  if (args.flags["json"] === true) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${render()}\n`);
}

function printHelp(): void {
  process.stdout.write("CGV 예매 CLI\n\n사용법:\n");
  for (const [name, command] of Object.entries(COMMANDS)) {
    const marker = SIDE_EFFECT_COMMANDS.has(name) ? " *" : "  ";
    process.stdout.write(`${marker}${command.usage}\n     ${command.description}\n`);
  }
  process.stdout.write(
    "\n공통 플래그:\n" +
      "  --json      결과를 JSON 으로 출력\n" +
      "  --confirm   부수효과가 있는 작업(*) 실행 승인\n" +
      "\n* 표시된 명령은 CGV 운영 데이터를 바꿉니다 (좌석 잠금 / 결제 개시).\n" +
      "결제 최종 승인은 토스 앱에서 직접 해야 하며 CLI 로 자동화할 수 없습니다.\n",
  );
}

const SIDE_EFFECT_COMMANDS = new Set(["hold", "release", "checkout"]);

async function main(): Promise<void> {
  const [name, ...rest] = process.argv.slice(2);
  if (name === undefined || name === "help" || name === "--help") {
    printHelp();
    return;
  }

  const command = COMMANDS[name];
  if (command === undefined) {
    process.stderr.write(`알 수 없는 명령: ${name}\n\n`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  await command.run(new CgvClient(), parseArgs(rest));
}

main().catch((error: unknown) => {
  const message = error instanceof CgvError || error instanceof Error ? error.message : String(error);
  process.stderr.write(`오류: ${message}\n`);
  process.exitCode = 1;
});
