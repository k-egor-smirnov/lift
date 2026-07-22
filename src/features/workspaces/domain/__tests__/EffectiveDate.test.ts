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

  it("depends only on its explicit clock input", () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(0);

    expect(
      effectiveDate(new Date("2026-07-22T06:00:00Z"), "Europe/Moscow", "09:00")
    ).toBe("2026-07-22");
    expect(dateNow).not.toHaveBeenCalled();

    dateNow.mockRestore();
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
