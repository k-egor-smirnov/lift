import { describe, expect, it } from "vitest";

import type { WorkspaceCommand } from "../../commands/WorkspaceCommand";
import { ChangeHash, WorkspaceId } from "../../../domain/WorkspaceIdentity";
import type {
  AcceptedRemoteChange,
  ApplyRemoteResult,
  CommitResult,
  WorkspaceUnitOfWork,
} from "../../ports/WorkspaceUnitOfWork";
import type { WorkspaceWriteAuthorization } from "../../ports/WorkspaceWriteAuthorization";
import { AuthorizedWorkspaceUnitOfWork } from "../AuthorizedWorkspaceUnitOfWork";

const command: WorkspaceCommand = {
  type: "DeleteTask",
  workspaceId: "ws_1",
  actorId: "actor_1",
  operationId: "operation_1",
  taskId: "task_1",
};

const remote: AcceptedRemoteChange = {
  workspaceId: "ws_1",
  actorId: "actor_1",
  eventId: "$event",
  roomId: "!room:test",
  senderUserId: "@editor:test",
  senderDeviceId: "EDITOR",
  bytes: new Uint8Array([1]),
  changeHash: "change_1",
  dependencies: [],
};

class RecordingUnitOfWork implements WorkspaceUnitOfWork {
  committed = false;
  applied = false;

  async commit(): Promise<CommitResult> {
    this.committed = true;
    return {
      workspaceId: WorkspaceId("ws_1"),
      changeHashes: [ChangeHash("change_1")],
      heads: [ChangeHash("change_1")],
    };
  }

  async applyRemote(): Promise<ApplyRemoteResult> {
    this.applied = true;
    return {
      workspaceId: WorkspaceId("ws_1"),
      changeHash: ChangeHash("change_1"),
      status: "applied",
      appliedChangeHashes: [ChangeHash("change_1")],
      heads: [ChangeHash("change_1")],
    };
  }
}

class DeniedAuthorization implements WorkspaceWriteAuthorization {
  async requireEdit(): Promise<void> {
    throw new Error("Workspace is read-only");
  }
}

describe("AuthorizedWorkspaceUnitOfWork", () => {
  it("rejects a local command before it reaches persistence", async () => {
    const inner = new RecordingUnitOfWork();
    const unitOfWork = new AuthorizedWorkspaceUnitOfWork(
      inner,
      new DeniedAuthorization()
    );

    await expect(unitOfWork.commit(command)).rejects.toThrow(
      "Workspace is read-only"
    );
    expect(inner.committed).toBe(false);
  });

  it("does not apply local-user authorization to a trusted remote change", async () => {
    const inner = new RecordingUnitOfWork();
    const unitOfWork = new AuthorizedWorkspaceUnitOfWork(
      inner,
      new DeniedAuthorization()
    );

    const result = await unitOfWork.applyRemote(remote);

    expect(result.status).toBe("applied");
    expect(inner.applied).toBe(true);
  });
});
