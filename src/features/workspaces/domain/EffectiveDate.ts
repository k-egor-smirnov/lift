import type { WorkspaceState } from "./WorkspaceState";

const START_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 1_440;
const RESOLUTION_RADIUS_MINUTES = 36 * 60;
const OFFSET_SAMPLE_STEP_MINUTES = 60;
const MAX_BOUNDARY_CACHE_ENTRIES = 256;

const boundaryCache = new Map<string, number>();

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

interface ZonedMinute {
  date: string;
  hour: number;
  minute: number;
  ordinal: number;
}

const zonedMinuteAt = (
  instantMilliseconds: number,
  formatter: Intl.DateTimeFormat
): ZonedMinute => {
  const parts = new Map(
    formatter
      .formatToParts(new Date(instantMilliseconds))
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
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error("Invalid formatted date");
  }

  const date = `${year}-${month}-${day}`;
  assertDateOnly(date, "formatted");

  return {
    date,
    hour,
    minute,
    ordinal: dateOnlyToEpochDay(date) * MINUTES_PER_DAY + hour * 60 + minute,
  };
};

const cacheBoundary = (key: string, instantMilliseconds: number): void => {
  if (boundaryCache.size >= MAX_BOUNDARY_CACHE_ENTRIES) {
    const oldestKey = boundaryCache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      boundaryCache.delete(oldestKey);
    }
  }
  boundaryCache.set(key, instantMilliseconds);
};

/**
 * Resolves a local boundary in a bounded +/-36 hour UTC window. A fold chooses
 * the earliest matching instant. If the wall minute is skipped by a gap, the
 * first valid local minute after it is used. Normal/fold paths sample possible
 * offsets hourly; only the gap path scans the bounded window minute by minute.
 */
const resolveBoundaryInstant = (
  localDate: string,
  boundaryMinutes: number,
  timeZone: string,
  formatter: Intl.DateTimeFormat
): number => {
  const cacheKey = `${timeZone}\0${localDate}\0${boundaryMinutes}`;
  const cached = boundaryCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const targetOrdinal =
    dateOnlyToEpochDay(localDate) * MINUTES_PER_DAY + boundaryMinutes;
  const offsets = new Set<number>();

  for (
    let utcMinute = targetOrdinal - RESOLUTION_RADIUS_MINUTES;
    utcMinute <= targetOrdinal + RESOLUTION_RADIUS_MINUTES;
    utcMinute += OFFSET_SAMPLE_STEP_MINUTES
  ) {
    const local = zonedMinuteAt(utcMinute * MILLISECONDS_PER_MINUTE, formatter);
    offsets.add(local.ordinal - utcMinute);
  }

  let earliestExactUtcMinute: number | undefined;
  for (const offset of offsets) {
    const candidateUtcMinute = targetOrdinal - offset;
    const candidate = zonedMinuteAt(
      candidateUtcMinute * MILLISECONDS_PER_MINUTE,
      formatter
    );
    if (
      candidate.ordinal === targetOrdinal &&
      (earliestExactUtcMinute === undefined ||
        candidateUtcMinute < earliestExactUtcMinute)
    ) {
      earliestExactUtcMinute = candidateUtcMinute;
    }
  }

  if (earliestExactUtcMinute !== undefined) {
    const result = earliestExactUtcMinute * MILLISECONDS_PER_MINUTE;
    cacheBoundary(cacheKey, result);
    return result;
  }

  let firstAfter: { utcMinute: number; localOrdinal: number } | undefined;
  for (
    let utcMinute = targetOrdinal - RESOLUTION_RADIUS_MINUTES;
    utcMinute <= targetOrdinal + RESOLUTION_RADIUS_MINUTES;
    utcMinute += 1
  ) {
    const localOrdinal = zonedMinuteAt(
      utcMinute * MILLISECONDS_PER_MINUTE,
      formatter
    ).ordinal;
    if (
      localOrdinal > targetOrdinal &&
      (firstAfter === undefined ||
        localOrdinal < firstAfter.localOrdinal ||
        (localOrdinal === firstAfter.localOrdinal &&
          utcMinute < firstAfter.utcMinute))
    ) {
      firstAfter = { utcMinute, localOrdinal };
    }
  }

  if (firstAfter === undefined) {
    throw new Error("Unable to resolve startOfDay boundary in bounded window");
  }

  const result = firstAfter.utcMinute * MILLISECONDS_PER_MINUTE;
  cacheBoundary(cacheKey, result);
  return result;
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
  const localDate = zonedMinuteAt(now.getTime(), formatter).date;
  const [boundaryHour, boundaryMinute] = startOfDay.split(":").map(Number);
  const boundaryMinutes = boundaryHour * 60 + boundaryMinute;
  const boundaryInstant = resolveBoundaryInstant(
    localDate,
    boundaryMinutes,
    timeZone,
    formatter
  );

  return now.getTime() < boundaryInstant
    ? epochDayToDateOnly(dateOnlyToEpochDay(localDate) - 1)
    : localDate;
};

/** Selects a dated Today relation without modifying historical selections. */
export const projectTodaySelection = (
  selections: Readonly<WorkspaceState["dailySelections"]>,
  onDate: string
): string[] => {
  assertDateOnly(onDate, "projection");
  const selection = selections[onDate];
  if (!selection) {
    return [];
  }

  return Object.entries(selection.adds)
    .filter(([, dots]) =>
      Object.keys(dots).some(
        (dot) =>
          !Object.prototype.hasOwnProperty.call(selection.removedDots, dot)
      )
    )
    .map(([taskId]) => taskId)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
};
