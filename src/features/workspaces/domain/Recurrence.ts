import type { TaskCrdtState } from "./WorkspaceState";
import {
  dateOnlyToEpochDay,
  epochDayToDateOnly,
  isValidDateOnly,
} from "./EffectiveDate";

export interface RecurrenceRule {
  frequency: "daily" | "weekly";
  interval: number;
  weekdays: number[];
  startsOn: string;
  endsOn: string | null;
}

type BaseCategory = TaskCrdtState["category"];
type ProjectedCategory = BaseCategory | "DEFERRED";
type DeferredProjectionState = Partial<
  Pick<TaskCrdtState, "category" | "deferredUntil" | "originalCategory">
>;

const BASE_CATEGORIES = new Set<BaseCategory>(["INBOX", "SIMPLE", "FOCUS"]);

const assertDateOnly: (
  value: unknown,
  field: string
) => asserts value is string = (value, field) => {
  if (!isValidDateOnly(value)) {
    throw new Error(`Invalid ${field} date`);
  }
};

const validateRule = (rule: RecurrenceRule): void => {
  if (rule.frequency !== "daily" && rule.frequency !== "weekly") {
    throw new Error("Invalid recurrence frequency");
  }

  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new Error("Invalid recurrence interval");
  }

  if (!Array.isArray(rule.weekdays)) {
    throw new Error("Invalid recurrence weekdays");
  }

  const uniqueWeekdays = new Set(rule.weekdays);
  if (
    uniqueWeekdays.size !== rule.weekdays.length ||
    rule.weekdays.some(
      (weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6
    )
  ) {
    throw new Error("Invalid recurrence weekday");
  }

  assertDateOnly(rule.startsOn, "startsOn");
  if (rule.endsOn !== null) {
    assertDateOnly(rule.endsOn, "endsOn");
    if (rule.endsOn < rule.startsOn) {
      throw new Error("Invalid endsOn: precedes startsOn");
    }
  }
};

const weekdayForEpochDay = (epochDay: number): number =>
  new Date(epochDay * 86_400_000).getUTCDay();

/** Enumerates recurrence calendar dates without consulting a clock or timezone. */
export const enumerateOccurrenceDates = (
  rule: RecurrenceRule,
  fromInclusive: string,
  toInclusive: string
): string[] => {
  validateRule(rule);
  assertDateOnly(fromInclusive, "fromInclusive");
  assertDateOnly(toInclusive, "toInclusive");

  if (toInclusive < fromInclusive) {
    return [];
  }

  const lowerBound =
    fromInclusive > rule.startsOn ? fromInclusive : rule.startsOn;
  const upperBound =
    rule.endsOn !== null && rule.endsOn < toInclusive
      ? rule.endsOn
      : toInclusive;

  if (upperBound < lowerBound) {
    return [];
  }

  const startsOnDay = dateOnlyToEpochDay(rule.startsOn);
  const firstDay = dateOnlyToEpochDay(lowerBound);
  const lastDay = dateOnlyToEpochDay(upperBound);
  const weekdaySet = new Set(rule.weekdays);
  const startWeek = startsOnDay - weekdayForEpochDay(startsOnDay);
  const occurrences = new Set<string>();

  for (let day = firstDay; day <= lastDay; day += 1) {
    if (rule.frequency === "daily") {
      if ((day - startsOnDay) % rule.interval === 0) {
        occurrences.add(epochDayToDateOnly(day));
      }
      continue;
    }

    const weekday = weekdayForEpochDay(day);
    const candidateWeek = day - weekday;
    const weeksFromAnchor = (candidateWeek - startWeek) / 7;
    if (weekdaySet.has(weekday) && weeksFromAnchor % rule.interval === 0) {
      occurrences.add(epochDayToDateOnly(day));
    }
  }

  return Array.from(occurrences).sort();
};

const isBaseCategory = (value: unknown): value is BaseCategory =>
  typeof value === "string" && BASE_CATEGORIES.has(value as BaseCategory);

/** Projects defer state for a date without rewriting the stored task. */
export const projectDeferred = (
  state: DeferredProjectionState | null | undefined,
  onDate: string
): ProjectedCategory | null => {
  assertDateOnly(onDate, "projection");

  if (!state || !isBaseCategory(state.category)) {
    return null;
  }

  if (!isValidDateOnly(state.deferredUntil)) {
    return state.category;
  }

  if (onDate < state.deferredUntil) {
    return "DEFERRED";
  }

  return isBaseCategory(state.originalCategory)
    ? state.originalCategory
    : state.category;
};
