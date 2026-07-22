const START_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

const dateFromParts = (year: number, month: number, day: number): Date => {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
};

export const isValidDateOnly = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = dateFromParts(year, month, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const assertDateOnly: (
  value: unknown,
  field: string
) => asserts value is string = (value, field) => {
  if (!isValidDateOnly(value)) {
    throw new Error(`Invalid ${field} date`);
  }
};

export const dateOnlyToEpochDay = (value: string): number => {
  assertDateOnly(value, "calendar");
  const match = DATE_ONLY_PATTERN.exec(value);

  if (!match) {
    throw new Error("Invalid calendar date");
  }

  return Math.floor(
    dateFromParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    ).getTime() / MILLISECONDS_PER_DAY
  );
};

export const epochDayToDateOnly = (epochDay: number): string => {
  const date = new Date(epochDay * MILLISECONDS_PER_DAY);
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) {
    throw new Error("Invalid timezone");
  }

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    throw new Error("Invalid timezone");
  }
};

/** Resolves the workspace date from an explicit instant and wall-clock boundary. */
export const effectiveDate = (
  now: Date,
  timeZone: string,
  startOfDay: string
): string => {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid date");
  }

  if (!START_OF_DAY_PATTERN.test(startOfDay)) {
    throw new Error("Invalid startOfDay");
  }

  const formatter = formatterFor(timeZone);
  const parts = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));

  if (
    !year ||
    !month ||
    !day ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error("Invalid formatted date");
  }

  const localDate = `${year}-${month}-${day}`;
  assertDateOnly(localDate, "formatted");

  const [boundaryHour, boundaryMinute] = startOfDay.split(":").map(Number);
  const wallClockMinutes = hour * 60 + minute;
  const boundaryMinutes = boundaryHour * 60 + boundaryMinute;

  return wallClockMinutes < boundaryMinutes
    ? epochDayToDateOnly(dateOnlyToEpochDay(localDate) - 1)
    : localDate;
};

/** Selects a dated Today relation without modifying historical selections. */
export const projectTodaySelection = <T>(
  selections: Readonly<Record<string, readonly T[]>>,
  onDate: string
): T[] => {
  assertDateOnly(onDate, "projection");
  return [...(selections[onDate] ?? [])];
};
