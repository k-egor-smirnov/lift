import { describe, expect, it } from "vitest";

import { MutableDevClock } from "../MutableDevClock";

describe("MutableDevClock", () => {
  it("advances only its in-memory value and returns defensive copies", () => {
    const clock = new MutableDevClock(new Date("2026-07-22T08:00:00.000Z"));

    const first = clock.now();
    first.setUTCFullYear(2000);
    clock.advanceDays(1);

    expect(clock.now().toISOString()).toBe("2026-07-23T08:00:00.000Z");
  });
});
