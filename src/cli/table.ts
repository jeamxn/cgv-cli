/** 터미널 표 출력. 한글은 2칸을 차지하므로 문자폭을 계산해 정렬한다. */

const WIDE =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += WIDE.test(char) ? 2 : 1;
  return width;
}

function pad(text: string, width: number, align: "left" | "right"): string {
  const filler = " ".repeat(Math.max(0, width - displayWidth(text)));
  return align === "right" ? filler + text : text + filler;
}

export interface Column<T> {
  readonly header: string;
  readonly value: (row: T) => string;
  readonly align?: "left" | "right";
}

export function renderTable<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const cells = rows.map((row) => columns.map((column) => column.value(row)));
  const widths = columns.map((column, index) =>
    Math.max(displayWidth(column.header), ...cells.map((row) => displayWidth(row[index] ?? ""))),
  );

  const line = (values: readonly string[]): string =>
    values
      .map((value, index) => pad(value, widths[index] ?? 0, columns[index]?.align ?? "left"))
      .join("  ")
      .trimEnd();

  const divider = widths.map((width) => "-".repeat(width)).join("  ");

  return [line(columns.map((column) => column.header)), divider, ...cells.map(line)].join("\n");
}
