import type { CheckpointStore } from "../ports/CheckpointStore";
import type { CurrentWorkspace } from "../ports/CurrentWorkspace";

export class RestoreCheckpointUseCase {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly checkpoints: CheckpointStore
  ) {}

  execute() {
    return this.checkpoints.restoreLatest(this.workspace.requireId());
  }
}
