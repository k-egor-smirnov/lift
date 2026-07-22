import { describe, expect, it } from "vitest";

import {
  enumerateOccurrenceDates,
  projectDeferred,
  type RecurrenceRule,
} from "../Recurrence";

const weeklyRule = (
  overrides: Partial<RecurrenceRule> = {}
): RecurrenceRule => ({
  frequency: "weekly",
  interval: 1,
  weekdays: [1],
  startsOn: "2026-07-01",
  endsOn: null,
  ...overrides,
});

const dailyRule = (
  overrides: Partial<RecurrenceRule> = {}
): RecurrenceRule => ({
  frequency: "daily",
  interval: 1,
  weekdays: [],
  startsOn: "2026-07-01",
  endsOn: null,
  ...overrides,
});

describe("enumerateOccurrenceDates", () => {
  it("uses inclusive query and rule bounds", () => {
    expect(
      enumerateOccurrenceDates(
        dailyRule({ startsOn: "2026-07-20", endsOn: "2026-07-22" }),
        "2026-07-20",
        "2026-07-22"
      )
    ).toEqual(["2026-07-20", "2026-07-21", "2026-07-22"]);
  });

  it("anchors a daily interval to startsOn", () => {
    expect(
      enumerateOccurrenceDates(
        dailyRule({ startsOn: "2026-01-02", interval: 3 }),
        "2026-01-01",
        "2026-01-10"
      )
    ).toEqual(["2026-01-02", "2026-01-05", "2026-01-08"]);
  });

  it("includes leap day using calendar-date iteration", () => {
    expect(
      enumerateOccurrenceDates(
        dailyRule({ startsOn: "2024-02-28" }),
        "2024-02-28",
        "2024-03-01"
      )
    ).toEqual(["2024-02-28", "2024-02-29", "2024-03-01"]);
  });

  it("iterates calendar dates independently of DST", () => {
    expect(
      enumerateOccurrenceDates(
        dailyRule({ startsOn: "2026-03-07" }),
        "2026-03-07",
        "2026-03-09"
      )
    ).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
  });

  it("catches up deterministically after a multi-year offline gap", () => {
    expect(
      enumerateOccurrenceDates(
        dailyRule({ startsOn: "2020-01-01" }),
        "2026-07-20",
        "2026-07-22"
      )
    ).toEqual(["2026-07-20", "2026-07-21", "2026-07-22"]);
  });

  it("anchors weekly intervals to the UTC calendar week containing startsOn", () => {
    expect(
      enumerateOccurrenceDates(
        weeklyRule({
          startsOn: "2026-07-22",
          interval: 2,
          weekdays: [5, 1],
        }),
        "2026-07-20",
        "2026-08-08"
      )
    ).toEqual(["2026-07-24", "2026-08-03", "2026-08-07"]);
  });

  it("sorts weekly results regardless of weekday order", () => {
    const reversed = enumerateOccurrenceDates(
      weeklyRule({ weekdays: [5, 1], startsOn: "2026-07-01" }),
      "2026-07-01",
      "2026-07-12"
    );
    const ordered = enumerateOccurrenceDates(
      weeklyRule({ weekdays: [1, 5], startsOn: "2026-07-01" }),
      "2026-07-01",
      "2026-07-12"
    );

    expect(reversed).toEqual(ordered);
    expect(reversed).toEqual(["2026-07-03", "2026-07-06", "2026-07-10"]);
  });

  it("returns no weekly occurrences for an empty weekday set", () => {
    expect(
      enumerateOccurrenceDates(
        weeklyRule({ weekdays: [] }),
        "2026-07-01",
        "2026-07-31"
      )
    ).toEqual([]);
  });

  it("returns no dates when the query is reversed", () => {
    expect(
      enumerateOccurrenceDates(dailyRule(), "2026-07-22", "2026-07-21")
    ).toEqual([]);
  });

  it("returns no dates when endsOn precedes the query", () => {
    expect(
      enumerateOccurrenceDates(
        dailyRule({ endsOn: "2026-07-10" }),
        "2026-07-20",
        "2026-07-22"
      )
    ).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN])(
    "rejects an invalid interval: %p",
    (interval) => {
      expect(() =>
        enumerateOccurrenceDates(
          dailyRule({ interval }),
          "2026-07-01",
          "2026-07-02"
        )
      ).toThrow(/interval/i);
    }
  );

  it.each([[[1, 1]], [[-1]], [[7]], [[1.5]]])(
    "rejects invalid or duplicate weekdays: %p",
    (weekdays) => {
      expect(() =>
        enumerateOccurrenceDates(
          weeklyRule({ weekdays }),
          "2026-07-01",
          "2026-07-02"
        )
      ).toThrow(/weekday/i);
    }
  );

  it.each([
    ["2026-02-29", "2026-03-01", "2026-03-02"],
    ["2026-01-01", "2026-02-29", "2026-03-02"],
    ["2026-01-01", "2026-03-01", "2026-02-29"],
  ])(
    "rejects a malformed calendar date in rule/query bounds: %p, %p, %p",
    (startsOn, fromInclusive, toInclusive) => {
      expect(() =>
        enumerateOccurrenceDates(
          dailyRule({ startsOn }),
          fromInclusive,
          toInclusive
        )
      ).toThrow(/date/i);
    }
  );

  it("rejects endsOn before startsOn", () => {
    expect(() =>
      enumerateOccurrenceDates(
        dailyRule({ startsOn: "2026-07-02", endsOn: "2026-07-01" }),
        "2026-07-01",
        "2026-07-02"
      )
    ).toThrow(/endsOn/i);
  });
});

describe("projectDeferred", () => {
  it("projects DEFERRED strictly before deferredUntil", () => {
    expect(
      projectDeferred(
        {
          category: "FOCUS",
          deferredUntil: "2026-07-22",
          originalCategory: "FOCUS",
        },
        "2026-07-21"
      )
    ).toBe("DEFERRED");
  });

  it("projects the original category on and after deferredUntil", () => {
    const state = {
      category: "FOCUS" as const,
      deferredUntil: "2026-07-22",
      originalCategory: "SIMPLE" as const,
    };

    expect(projectDeferred(state, "2026-07-22")).toBe("SIMPLE");
    expect(projectDeferred(state, "2026-07-23")).toBe("SIMPLE");
  });

  it("falls back safely for null and malformed deferral metadata", () => {
    expect(projectDeferred(null, "2026-07-21")).toBeNull();
    expect(
      projectDeferred(
        {
          category: "INBOX",
          deferredUntil: null,
          originalCategory: null,
        },
        "2026-07-21"
      )
    ).toBe("INBOX");
    expect(
      projectDeferred(
        {
          category: "FOCUS",
          deferredUntil: "not-a-date",
          originalCategory: "SIMPLE",
        },
        "2026-07-21"
      )
    ).toBe("FOCUS");
  });

  it("uses category after the boundary when originalCategory is absent", () => {
    const state = {
      category: "FOCUS" as const,
      deferredUntil: "2026-07-22",
      originalCategory: null,
    };

    expect(projectDeferred(state, "2026-07-21")).toBe("DEFERRED");
    expect(projectDeferred(state, "2026-07-22")).toBe("FOCUS");
  });

  it("rejects an invalid projection date", () => {
    expect(() => projectDeferred(null, "2026-02-29")).toThrow(/date/i);
  });
});
