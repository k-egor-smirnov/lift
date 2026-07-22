import type { WorkspaceState } from "./WorkspaceState";

const START_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;
const RESOLUTION_RADIUS_SECONDS = 36 * 60 * 60;
const OFFSET_SAMPLE_STEP_SECONDS = 60 * 60;
const GAP_COARSE_STEP_SECONDS = 60;
const GAP_REFINEMENT_RADIUS_SECONDS = 60;
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
      second: "2-digit",
    });
  } catch {
    throw new Error("Invalid timezone");
  }
};

interface ZonedSecond {
  date: string;
  hour: number;
  minute: number;
  second: number;
  ordinal: number;
}

const zonedSecondAt = (
  instantMilliseconds: number,
  formatter: Intl.DateTimeFormat
): ZonedSecond => {
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
  const second = Number(parts.get("second"));

  if (
    !year ||
    !month ||
    !day ||
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59 ||
    !Number.isInteger(second) ||
    second < 0 ||
    second > 59
  ) {
    throw new Error("Invalid formatted date");
  }

  const date = `${year}-${month}-${day}`;
  assertDateOnly(date, "formatted");

  return {
    date,
    hour,
    minute,
    second,
    ordinal:
      dateOnlyToEpochDay(date) * SECONDS_PER_DAY +
      hour * 60 * 60 +
      minute * 60 +
      second,
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
 * Resolves local HH:mm:00 in a bounded +/-36 hour UTC window. Exact offset
 * candidates preserve historical offset seconds and folds choose the earliest
 * matching instant. For a gap, a bounded minute scan locates the transition,
 * then a bounded +/-60 second scan selects the actual first valid instant.
 */
const resolveBoundaryInstant = (
  localDate: string,
  boundarySeconds: number,
  timeZone: string,
  formatter: Intl.DateTimeFormat
): number => {
  const cacheKey = `${timeZone}\0${localDate}\0${boundarySeconds}`;
  const cached = boundaryCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const targetOrdinal =
    dateOnlyToEpochDay(localDate) * SECONDS_PER_DAY + boundarySeconds;
  const offsets = new Set<number>();

  for (
    let utcSecond = targetOrdinal - RESOLUTION_RADIUS_SECONDS;
    utcSecond <= targetOrdinal + RESOLUTION_RADIUS_SECONDS;
    utcSecond += OFFSET_SAMPLE_STEP_SECONDS
  ) {
    const local = zonedSecondAt(utcSecond * MILLISECONDS_PER_SECOND, formatter);
    offsets.add(local.ordinal - utcSecond);
  }

  const findEarliestExact = (): number | undefined => {
    let earliestExactUtcSecond: number | undefined;
    for (const offset of offsets) {
      const candidateUtcSecond = targetOrdinal - offset;
      const candidate = zonedSecondAt(
        candidateUtcSecond * MILLISECONDS_PER_SECOND,
        formatter
      );
      if (
        candidate.ordinal === targetOrdinal &&
        (earliestExactUtcSecond === undefined ||
          candidateUtcSecond < earliestExactUtcSecond)
      ) {
        earliestExactUtcSecond = candidateUtcSecond;
      }
    }
    return earliestExactUtcSecond;
  };

  let earliestExactUtcSecond = findEarliestExact();
  if (earliestExactUtcSecond !== undefined) {
    const result = earliestExactUtcSecond * MILLISECONDS_PER_SECOND;
    cacheBoundary(cacheKey, result);
    return result;
  }

  let firstAfterCoarseUtcSecond: number | undefined;
  for (
    let utcSecond = targetOrdinal - RESOLUTION_RADIUS_SECONDS;
    utcSecond <= targetOrdinal + RESOLUTION_RADIUS_SECONDS;
    utcSecond += GAP_COARSE_STEP_SECONDS
  ) {
    const local = zonedSecondAt(utcSecond * MILLISECONDS_PER_SECOND, formatter);
    offsets.add(local.ordinal - utcSecond);
    if (
      local.ordinal > targetOrdinal &&
      firstAfterCoarseUtcSecond === undefined
    ) {
      firstAfterCoarseUtcSecond = utcSecond;
    }
  }

  earliestExactUtcSecond = findEarliestExact();
  if (earliestExactUtcSecond !== undefined) {
    const result = earliestExactUtcSecond * MILLISECONDS_PER_SECOND;
    cacheBoundary(cacheKey, result);
    return result;
  }

  if (firstAfterCoarseUtcSecond === undefined) {
    throw new Error("Unable to resolve startOfDay boundary in bounded window");
  }

  let firstAfterExactUtcSecond: number | undefined;
  const refinementStart =
    firstAfterCoarseUtcSecond - GAP_REFINEMENT_RADIUS_SECONDS;
  const refinementEnd =
    firstAfterCoarseUtcSecond + GAP_REFINEMENT_RADIUS_SECONDS;
  for (
    let utcSecond = refinementStart;
    utcSecond <= refinementEnd;
    utcSecond += 1
  ) {
    const localOrdinal = zonedSecondAt(
      utcSecond * MILLISECONDS_PER_SECOND,
      formatter
    ).ordinal;
    if (localOrdinal > targetOrdinal) {
      firstAfterExactUtcSecond = utcSecond;
      break;
    }
  }

  if (firstAfterExactUtcSecond === undefined) {
    throw new Error("Unable to refine startOfDay gap boundary");
  }

  const result = firstAfterExactUtcSecond * MILLISECONDS_PER_SECOND;
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
  const localDate = zonedSecondAt(now.getTime(), formatter).date;
  const [boundaryHour, boundaryMinute] = startOfDay.split(":").map(Number);
  const boundarySeconds =
    boundaryHour * 60 * 60 + boundaryMinute * SECONDS_PER_MINUTE;
  const boundaryInstant = resolveBoundaryInstant(
    localDate,
    boundarySeconds,
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
