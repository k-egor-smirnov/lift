import { describe, expect, it, vi } from "vitest";

import { effectiveDate, projectTodaySelection } from "../EffectiveDate";

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

  it("supports timezones with non-whole-hour offsets", () => {
    expect(
      effectiveDate(new Date("2026-07-22T03:29:00Z"), "Asia/Kathmandu", "09:15")
    ).toBe("2026-07-21");
    expect(
      effectiveDate(new Date("2026-07-22T03:30:00Z"), "Asia/Kathmandu", "09:15")
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
  it("switches projections without deleting the previous day's stored entries", () => {
    const stored = Object.freeze({
      "2026-07-21": Object.freeze(["task-a", "task-b"]),
    });
    const before = JSON.stringify(stored);

    expect(projectTodaySelection(stored, "2026-07-21")).toEqual([
      "task-a",
      "task-b",
    ]);
    expect(projectTodaySelection(stored, "2026-07-22")).toEqual([]);
    expect(JSON.stringify(stored)).toBe(before);
    expect(stored["2026-07-21"]).toEqual(["task-a", "task-b"]);
  });

  it("validates the projected date", () => {
    expect(() => projectTodaySelection({}, "2026-02-29")).toThrow(/date/i);
  });
});
