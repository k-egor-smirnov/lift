import type { CheckpointStore } from "../ports/CheckpointStore";
import type { CurrentWorkspace } from "../ports/CurrentWorkspace";

export class CreateCheckpointUseCase {
  constructor(
    private readonly workspace: CurrentWorkspace,
    private readonly checkpoints: CheckpointStore
  ) {}

  execute() {
    return this.checkpoints.publish(this.workspace.requireId());
  }
}
