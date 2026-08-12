#!/usr/bin/env node
/**
 * CLI 엔트리. 라이브러리는 CLI 를 모르고, CLI 만 라이브러리를 안다.
 * 명령 추가는 COMMANDS 레지스트리에 항목을 더하는 것으로 끝난다(OCP).
 */
import { CgvClient } from "./client.ts";
import { CgvError } from "./core/errors.ts";
import { todayInSeoul } from "./mappers/primitives.ts";
import { renderTable, type Column } from "./cli/table.ts";
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
};

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
  process.stdout.write("CGV 예매 조회 CLI\n\n사용법:\n");
  for (const command of Object.values(COMMANDS)) {
    process.stdout.write(`  ${command.usage.padEnd(46)} ${command.description}\n`);
  }
  process.stdout.write("\n공통 플래그:\n  --json    결과를 JSON 으로 출력\n");
}

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
