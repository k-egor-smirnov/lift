import { describe, expect, it, vi } from "vitest";

import { effectiveDate, projectTodaySelection } from "../EffectiveDate";
import type { WorkspaceState } from "../WorkspaceState";

describe("effectiveDate", () => {
  it("uses the previous date one minute before the workspace boundary", () => {
    expect(
      effectiveDate(new Date("2026-07-22T05:59:00Z"), "Europe/Moscow", "09:00")
    ).toBe("2026-07-21");
  });

  it("uses the current date exactly at the workspace boundary", () => {
    expect(
      effectiveDate(new Date("2026-07-22T06:00:00Z"), "Europe/Moscow", "09:00")
    ).toBe("2026-07-22");
  });

  it("uses wall-clock time across a daylight-saving transition", () => {
    expect(
      effectiveDate(
        new Date("2026-03-08T08:59:00Z"),
        "America/New_York",
        "05:00"
      )
    ).toBe("2026-03-07");
    expect(
      effectiveDate(
        new Date("2026-03-08T09:00:00Z"),
        "America/New_York",
        "05:00"
      )
    ).toBe("2026-03-08");
  });

  it("does not regress after the earliest boundary occurrence in a fall-back fold", () => {
    const instants = [
      "2026-11-01T05:30:00Z", // first 01:30
      "2026-11-01T06:00:00Z", // second 01:00
      "2026-11-01T06:30:00Z", // second 01:30
    ];

    expect(
      instants.map((instant) =>
        effectiveDate(new Date(instant), "America/New_York", "01:30")
      )
    ).toEqual(["2026-11-01", "2026-11-01", "2026-11-01"]);
  });

  it("preserves the earliest occurrence through Lord Howe's 30-minute fold", () => {
    expect(
      [
        "2026-04-04T14:45:00Z", // first 01:45
        "2026-04-04T15:00:00Z", // second 01:30
        "2026-04-04T15:15:00Z", // second 01:45
      ].map((instant) =>
        effectiveDate(new Date(instant), "Australia/Lord_Howe", "01:45")
      )
    ).toEqual(["2026-04-05", "2026-04-05", "2026-04-05"]);
  });

  it("uses the first valid instant after a spring-forward boundary gap", () => {
    expect(
      effectiveDate(
        new Date("2026-03-08T06:59:00Z"),
        "America/New_York",
        "02:30"
      )
    ).toBe("2026-03-07");
    expect(
      effectiveDate(
        new Date("2026-03-08T07:00:00Z"),
        "America/New_York",
        "02:30"
      )
    ).toBe("2026-03-08");
  });

  it("uses the first valid instant after Lord Howe's 30-minute gap", () => {
    expect(
      effectiveDate(
        new Date("2026-10-03T15:29:59Z"),
        "Australia/Lord_Howe",
        "02:15"
      )
    ).toBe("2026-10-03");
    expect(
      effectiveDate(
        new Date("2026-10-03T15:30:00Z"),
        "Australia/Lord_Howe",
        "02:15"
      )
    ).toBe("2026-10-04");
  });

  it("resolves Paris local midnight at its historical second offset", () => {
    expect(
      effectiveDate(new Date("1899-12-31T23:50:38Z"), "Europe/Paris", "00:00")
    ).toBe("1899-12-31");
    expect(
      effectiveDate(new Date("1899-12-31T23:50:39Z"), "Europe/Paris", "00:00")
    ).toBe("1900-01-01");
  });

  it("resolves Monrovia local midnight at its historical half-minute offset", () => {
    expect(
      effectiveDate(
        new Date("1970-01-01T00:44:29Z"),
        "Africa/Monrovia",
        "00:00"
      )
    ).toBe("1969-12-31");
    expect(
      effectiveDate(
        new Date("1970-01-01T00:44:30Z"),
        "Africa/Monrovia",
        "00:00"
      )
    ).toBe("1970-01-01");
  });

  it("uses the exact earliest instant through Paris's 1911 sub-minute fold", () => {
    expect(
      [
        "1911-03-10T23:45:38Z", // local 23:54:59, before first 23:55
        "1911-03-10T23:45:39Z", // first local 23:55:00
        "1911-03-10T23:50:39Z", // fold back to local 23:50:39
        "1911-03-10T23:55:00Z", // second local 23:55:00
      ].map((instant) =>
        effectiveDate(new Date(instant), "Europe/Paris", "23:55")
      )
    ).toEqual(["1911-03-09", "1911-03-10", "1911-03-10", "1911-03-10"]);
  });

  it("uses the exact first instant after Monrovia's 1972 sub-minute gap", () => {
    expect(
      effectiveDate(
        new Date("1972-01-07T00:44:29Z"),
        "Africa/Monrovia",
        "00:30"
      )
    ).toBe("1972-01-06");
    expect(
      effectiveDate(
        new Date("1972-01-07T00:44:30Z"),
        "Africa/Monrovia",
        "00:30"
      )
    ).toBe("1972-01-07");
  });

  it("supports timezones with non-whole-hour offsets", () => {
    expect(
      effectiveDate(new Date("2026-07-22T03:29:00Z"), "Asia/Kathmandu", "09:15")
    ).toBe("2026-07-21");
    expect(
      effectiveDate(new Date("2026-07-22T03:30:00Z"), "Asia/Kathmandu", "09:15")
    ).toBe("2026-07-22");
  });

  it("supports a timezone on the date-line offset", () => {
    expect(
      effectiveDate(
        new Date("2026-07-21T19:59:00Z"),
        "Pacific/Kiritimati",
        "10:00"
      )
    ).toBe("2026-07-21");
    expect(
      effectiveDate(
        new Date("2026-07-21T20:00:00Z"),
        "Pacific/Kiritimati",
        "10:00"
      )
    ).toBe("2026-07-22");
  });

  it("handles Apia's skipped calendar date without inventing a boundary", () => {
    expect(
      effectiveDate(new Date("2011-12-30T09:59:59Z"), "Pacific/Apia", "00:00")
    ).toBe("2011-12-29");
    expect(
      effectiveDate(new Date("2011-12-30T10:00:00Z"), "Pacific/Apia", "00:00")
    ).toBe("2011-12-31");
  });

  it("depends only on its explicit clock input", () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(0);

    expect(
      effectiveDate(new Date("2026-07-22T06:00:00Z"), "Europe/Moscow", "09:00")
    ).toBe("2026-07-22");
    expect(dateNow).not.toHaveBeenCalled();

    dateNow.mockRestore();
  });

  it("does not depend on the process timezone", () => {
    const originalProcessTimezone = process.env.TZ;

    try {
      process.env.TZ = "Pacific/Honolulu";
      const fromHonoluluProcess = effectiveDate(
        new Date("2026-07-22T06:00:00Z"),
        "Europe/Moscow",
        "09:00"
      );
      process.env.TZ = "Asia/Tokyo";
      const fromTokyoProcess = effectiveDate(
        new Date("2026-07-22T06:00:00Z"),
        "Europe/Moscow",
        "09:00"
      );

      expect(fromHonoluluProcess).toBe("2026-07-22");
      expect(fromTokyoProcess).toBe(fromHonoluluProcess);
    } finally {
      if (originalProcessTimezone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalProcessTimezone;
      }
    }
  });

  it.each(["", "Mars/Olympus_Mons"])(
    "rejects an invalid timezone: %p",
    (timeZone) => {
      expect(() =>
        effectiveDate(new Date("2026-07-22T06:00:00Z"), timeZone, "09:00")
      ).toThrow(/timezone/i);
    }
  );

  it.each(["9:00", "09:60", "24:00", "-01:00"])(
    "rejects an invalid start-of-day: %p",
    (startOfDay) => {
      expect(() =>
        effectiveDate(
          new Date("2026-07-22T06:00:00Z"),
          "Europe/Moscow",
          startOfDay
        )
      ).toThrow(/startOfDay/i);
    }
  );

  it("rejects an invalid explicit date", () => {
    expect(() =>
      effectiveDate(new Date("invalid"), "Europe/Moscow", "09:00")
    ).toThrow(/date/i);
  });
});

describe("projectTodaySelection", () => {
  it("projects live IDs from persisted OR-sets without changing historical tombstones", () => {
    const stored: WorkspaceState["dailySelections"] = {
      "2026-07-21": {
        adds: {
          "task-b": { "2@aa": true },
          "task-removed": { "4@aa": true },
          "task-a": { "1@aa": true, "3@aa": true },
        },
        removedDots: {
          "3@aa": true,
          "4@aa": true,
          "orphan-tombstone@aa": true,
        },
      },
    };
    const before = JSON.stringify(stored);

    const oldProjection = projectTodaySelection(stored, "2026-07-21");
    expect(oldProjection).toEqual(["task-a", "task-b"]);
    expect(projectTodaySelection(stored, "2026-07-22")).toEqual([]);
    oldProjection.push("local-only-mutation");
    expect(projectTodaySelection(stored, "2026-07-21")).toEqual([
      "task-a",
      "task-b",
    ]);
    expect(JSON.stringify(stored)).toBe(before);
    expect(stored["2026-07-21"].removedDots).toEqual({
      "3@aa": true,
      "4@aa": true,
      "orphan-tombstone@aa": true,
    });
  });

  it("validates the projected date", () => {
    expect(() => projectTodaySelection({}, "2026-02-29")).toThrow(/date/i);
  });
});
