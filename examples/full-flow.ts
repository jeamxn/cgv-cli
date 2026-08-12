/**
 * 첫 접속 → 영화 선택 → 영화관 선택 → 날짜 선택 → 상영관별 잔여좌석까지
 * 브라우저 플로우 4단계를 그대로 재현한다.
 *
 * 실행: pnpm example
 */
import { CgvClient } from "../src/index.ts";

const client = new CgvClient();

// 1단계 — 예매 가능 영화 (예매율 순)
const movies = await client.movies.list();
const movie = movies[0];
if (movie === undefined) throw new Error("예매 가능한 영화가 없습니다.");
console.log(
  `1. 영화: ${movie.title} (${movie.id}) ${movie.rating} ${movie.runtimeMinutes}분 예매율 ${movie.bookingRate}%`,
);

// 2단계 — 그 영화를 상영하는 지역/극장
const regions = await client.theaters.byMovie(movie.id);
const region = regions[0];
const theater = region?.theaters[0];
if (region === undefined || theater === undefined) throw new Error("상영 극장이 없습니다.");
console.log(
  `2. 극장: [${region.name}] ${theater.name} (${theater.id}) — 지역 스케줄 ${region.scheduleCount}건`,
);

// 3단계 — 상영 날짜
const dates = await client.dates.byMovieAndTheater(movie.id, theater.id);
const firstDate = dates[0];
if (firstDate === undefined) throw new Error("상영 날짜가 없습니다.");
console.log(
  `3. 날짜: ${dates.length}일 오픈 → ${firstDate.date} 선택 (마지막 오픈일 ${await client.dates.last()})`,
);

// 4단계 — 상영관별 잔여좌석
const screens = await client.schedules.byScreen({
  movieId: movie.id,
  theaterId: theater.id,
  date: firstDate.date,
});

console.log(`4. 상영관 ${screens.length}개`);
for (const screen of screens) {
  console.log(`\n  [${screen.screenId}] ${screen.screenDisplayName} (총 ${screen.totalSeats}석)`);
  for (const showtime of screen.showtimes) {
    const occupancy =
      showtime.occupancyRate === null ? "-" : `${(showtime.occupancyRate * 100).toFixed(1)}%`;
    console.log(
      `    ${showtime.startTime}~${showtime.endTime} ${showtime.format.padEnd(6)}` +
        ` 잔여 ${String(showtime.remainingSeats).padStart(3)}/${showtime.sellableSeats}` +
        ` (점유 ${occupancy}) ${showtime.bookable ? "예매가능" : "예매불가"}`,
    );
  }
}

// 5단계(옵션) — 좌석 선택 직전 예매제어 체크
const target = screens[0]?.showtimes[0];
if (target !== undefined) {
  const bookable = await client.schedules.isBookable({
    movieId: movie.id,
    theaterId: theater.id,
    date: target.date,
    screenId: target.screenId,
    sequence: target.sequence,
  });
  console.log(`\n5. ${target.screenName} ${target.startTime} 회차 예매 가능 여부: ${bookable}`);
}
