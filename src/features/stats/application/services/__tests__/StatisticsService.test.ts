import { describe, expect, it, vi } from "vitest";

import { WorkspaceId } from "../../../../workspaces/domain/WorkspaceIdentity";
import { StatisticsService } from "../StatisticsService";

describe("StatisticsService", () => {
  it("aggregates only deterministic projection rows", async () => {
    const getRange = vi.fn().mockResolvedValue([
      {
        workspaceId: "workspace-1",
        date: "2026-07-20",
        simpleCompleted: 1,
        focusCompleted: 2,
        inboxReviewed: 3,
      },
      {
        workspaceId: "workspace-1",
        date: "2026-07-21",
        simpleCompleted: 4,
        focusCompleted: 5,
        inboxReviewed: 6,
      },
    ]);
    const service = new StatisticsService(
      {
        getId: () => WorkspaceId("workspace-1"),
        requireId: () => WorkspaceId("workspace-1"),
      },
      { getRange }
    );

    await expect(
      service.getWeeklyStatistics(new Date(2026, 6, 22))
    ).resolves.toEqual({
      weekStart: "2026-07-20",
      weekEnd: "2026-07-26",
      simpleCompleted: 5,
      focusCompleted: 7,
      inboxReviewed: 9,
    });
    expect(getRange).toHaveBeenCalledWith(
      "workspace-1",
      "2026-07-20",
      "2026-07-26"
    );
  });
});
