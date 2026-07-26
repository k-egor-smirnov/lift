import { describe, expect, it, vi } from "vitest";

import type { WorkspaceRepository } from "../../../../features/workspaces/application/ports/WorkspaceRepository";
import { WorkspaceId } from "../../../../features/workspaces/domain/WorkspaceIdentity";
import { DeferredTaskService } from "../DeferredTaskService";

describe("DeferredTaskService", () => {
  it("queries the dated projection and performs no transition writes", async () => {
    const repository: Pick<WorkspaceRepository, "findTasks"> = {
      findTasks: vi.fn().mockResolvedValue([]),
    };
    const service = new DeferredTaskService(
      {
        getId: () => WorkspaceId("workspace-1"),
        requireId: () => WorkspaceId("workspace-1"),
      },
      repository as WorkspaceRepository
    );

    await expect(service.getDeferredTasks("2026-07-22")).resolves.toEqual([]);
    expect(repository.findTasks).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      effectiveDate: "2026-07-22",
      projectedCategory: "DEFERRED",
      completion: "active",
    });
  });
});
