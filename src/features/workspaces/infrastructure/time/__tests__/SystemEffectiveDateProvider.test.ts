import { describe, expect, it, vi } from "vitest";

import { SystemEffectiveDateProvider } from "../SystemEffectiveDateProvider";

describe("SystemEffectiveDateProvider", () => {
  it("delegates workspace timezone and start-of-day to the pure date projection", () => {
    const now = vi.fn(() => new Date("2026-07-22T05:59:59.000Z"));
    const clock = { now };
    const provider = new SystemEffectiveDateProvider(clock);

    expect(
      provider.current({ timezone: "Europe/Moscow", startOfDay: "09:00" })
    ).toBe("2026-07-21");
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("validates settings through the Domain projection", () => {
    const provider = new SystemEffectiveDateProvider({
      now: () => new Date("2026-07-22T08:00:00.000Z"),
    });

    expect(() =>
      provider.current({ timezone: "Not/AZone", startOfDay: "09:00" })
    ).toThrow("Invalid timezone");
    expect(() =>
      provider.current({ timezone: "UTC", startOfDay: "24:00" })
    ).toThrow("Invalid startOfDay");
  });
});
