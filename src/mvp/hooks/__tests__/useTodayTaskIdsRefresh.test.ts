import { renderHook, act } from "@testing-library/react";
import { vi } from "vitest";
import { useTodayTaskIdsRefresh } from "../useTodayTaskIdsRefresh";
import { DateOnly } from "../../../shared/domain/value-objects/DateOnly";

describe("useTodayTaskIdsRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.removeItem("__dev_mocked_date__");
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem("__dev_mocked_date__");
  });

  it("calls refresh when the day changes", async () => {
    const refresh = vi.fn();
    const today = DateOnly.fromString("2024-01-01");
    const tomorrow = DateOnly.fromString("2024-01-02");
    const spy = vi
      .spyOn(DateOnly, "today")
      .mockReturnValueOnce(today)
      .mockReturnValue(tomorrow);

    renderHook(() => useTodayTaskIdsRefresh(refresh));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(refresh).toHaveBeenCalled();
    spy.mockRestore();
  });
});

