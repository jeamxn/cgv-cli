# cgv-cli

CGV 예매 플로우(첫 접속 → 영화 → 영화관 → 날짜 → 상영관별 잔여좌석)를 감싼 TypeScript 클라이언트. 런타임 의존성 0.

## 설치

```bash
git clone https://github.com/jeamxn/cgv-cli.git
cd cgv-cli
pnpm install
pnpm build         # dist/ 생성
```

## Node 버전

런타임 의존성은 없고 내장 `fetch` 만 쓴다.

| 용도 | 필요 버전 | 이유 |
|---|---|---|
| 빌드 결과물 실행 (`node dist/cli.js`), `pnpm cli` | **Node 20+** | `fetch`, `Headers.getSetCookie()` |
| 소스 직접 실행 (`pnpm dev`, `pnpm example`) | **Node 22.6+** | `--experimental-strip-types` |

`.nvmrc` 가 있으니 `nvm use` 로 맞추면 전부 동작한다. Node 20 에서 `pnpm dev` 를 돌리면
`node: bad option: --experimental-strip-types` 가 난다 — 이때는 `pnpm cli` 를 쓰면 된다.

## 라이브러리

```ts
import { CgvClient } from "cgv-cli";

const cgv = new CgvClient();

// 1. 영화
const movies = await cgv.movies.list();              // 예매율 내림차순
const movie = await cgv.movies.findByTitle("오디세이");

// 2. 영화관 (그 영화를 상영하는 지역/극장만)
const regions = await cgv.theaters.byMovie(movie.id);
const theater = await cgv.theaters.findByName("용산", movie.id);

// 3. 날짜
const dates = await cgv.dates.byMovieAndTheater(movie.id, theater.id);
const lastOpenDate = await cgv.dates.last();

// 4. 상영관별 잔여좌석
const screens = await cgv.schedules.byScreen({
  movieId: movie.id,
  theaterId: theater.id,
  date: dates[0].date,
});

for (const screen of screens) {
  for (const s of screen.showtimes) {
    console.log(screen.screenDisplayName, s.startTime, `${s.remainingSeats}/${s.sellableSeats}`);
  }
}

// 5. 좌석 선택 직전 예매제어 체크 (선택)
await cgv.schedules.isBookable({ ...query, screenId: "002", sequence: "3" });
```

`schedules.list()` 는 평면 배열, `schedules.byScreen()` 은 상영관 단위로 묶은 형태다.

## CLI

```bash
# 어느 Node 든 동작 (매번 빌드 후 실행)
pnpm cli seats 오디세이 용산아이파크몰 20260812

# 이미 빌드했다면 (가장 빠름)
node dist/cli.js seats 오디세이 용산아이파크몰

# 개발용 빠른 루프 (Node 22.6+)
pnpm dev seats 오디세이 용산아이파크몰
```

| 명령 | 설명 |
|---|---|
| `cgv movies [--keyword <제목>]` | 예매 가능한 영화 목록 |
| `cgv theaters <영화ID\|제목>` | 그 영화를 상영하는 지역/극장 |
| `cgv dates <영화ID\|제목> <극장ID\|극장명>` | 상영 날짜 목록 |
| `cgv seats <영화ID\|제목> <극장ID\|극장명> [YYYYMMDD]` | 상영관별 회차 + 잔여좌석 |

모든 명령에 `--json` 사용 가능. 영화/극장 인자는 ID 또는 이름 둘 다 받는다(이름이면 자동 검색).

## Cloudflare 관련 주의사항 (중요)

CGV 는 Cloudflare Bot Management 뒤에 있고, **차단 기준은 헤더가 아니라 TLS 지문**이다. 2026-08-12 실측:

| 클라이언트 | 결과 |
|---|---|
| `curl` (전체 Chrome 헤더 포함) | **403** |
| Node 내장 `fetch` (undici) | **200** |

따라서:

- **axios / node-fetch / got 등으로 갈아타지 말 것.** 내장 `fetch` 를 그대로 쓴다.
- `curl` 로 디버깅하면 403 만 보게 된다. 재현은 반드시 Node 로 한다.
- Playwright / curl-impersonate 같은 무거운 우회는 필요 없다.

`__cf_bm` 쿠키는 `FetchTransport` 가 첫 요청 전에 `https://cgv.co.kr/` 를 한 번 찍어 자동 확보하고, 만료(약 30분)되면 다시 받는다. 403 을 만나면 쿠키를 버리고 재발급 후 재시도한다. 다만 실측상 이 쿠키 없이도 API 가 응답하므로 **쿠키는 필수가 아니라 레이트리밋 완화용 최적화**다.

## 응답 필드 매핑

잔여좌석은 `searchSchByMov` 한 번에 다 오므로 좌석 조회용 추가 호출이 없다.

| 원시 필드 | 도메인 필드 | 의미 |
|---|---|---|
| `frSeatCnt` | `remainingSeats` | 잔여 좌석수 |
| `cpSeatCnt` | `sellableSeats` | 판매가능 좌석수 |
| `stcnt` | `totalSeats` | 물리 총 좌석수 |
| `scnsrtTm` | `startTime` | 상영 시작 (HHMM → HH:MM) |
| `rlMovStartTm` | `actualStartTime` | 광고 후 실제 시작 |
| `cntlYn` | `bookable` 판정 | Y 면 예매 제어중 |
| `scnsNo` / `scnSseq` | `screenId` / `sequence` | 상영관 / 회차 |

## 알려진 특이사항

- 같은 `siteNo` 응답에 **씨네드쉐프 등 별도 브랜드관이 섞여** 온다. 그래서 `ScreenSchedule.theaterName` 을 상영관 단위로 들고 있다.
- 상영 종료시각이 `24:02` 처럼 24 를 넘길 수 있다(익일 상영). 날짜 계산 시 주의.
- 같은 회차 번호(`scnSseq`)가 서로 다른 상품으로 중복 등장할 수 있다.
- CGV 웹은 날짜를 선택하면 14일치를 전부 프리페치한다. 이 클라이언트는 요청한 날짜만 호출한다.

## 구조

```
src/
  core/       config, errors, cookie-jar, transport(HttpTransport 인터페이스 + FetchTransport)
  types/      raw(원시 응답 스키마), domain(소비자 모델)
  mappers/    raw -> domain 변환
  resources/  movies / theaters / dates / schedules  (플로우 4단계와 1:1)
  client.ts   조립 지점
  cli.ts      CLI (명령 레지스트리)
```

테스트 시 `new CgvClient({ transport: fakeTransport })` 로 HTTP 를 갈아끼울 수 있다.
