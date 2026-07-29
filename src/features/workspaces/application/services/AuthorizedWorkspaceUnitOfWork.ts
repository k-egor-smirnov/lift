import type { WorkspaceWriteAuthorization } from "../ports/WorkspaceWriteAuthorization";
import type {
  AcceptedRemoteChange,
  ApplyRemoteResult,
  CommitResult,
  PersistableDomainEvent,
  WorkspaceUnitOfWork,
} from "../ports/WorkspaceUnitOfWork";
import type { WorkspaceCommand } from "../commands/WorkspaceCommand";

/**
 * Applies the current local Matrix identity policy only to local commands.
 * Remote changes have already passed sender/device/ACL validation in the
 * trusted inbox processor and must remain replayable on read-only clients.
 */
export class AuthorizedWorkspaceUnitOfWork implements WorkspaceUnitOfWork {
  constructor(
    private readonly inner: WorkspaceUnitOfWork,
    private readonly authorization: WorkspaceWriteAuthorization
  ) {}

  async commit(
    command: WorkspaceCommand,
    events?: readonly PersistableDomainEvent[]
  ): Promise<CommitResult> {
    await this.authorization.requireEdit(command.workspaceId);
    return this.inner.commit(command, events);
  }

  applyRemote(input: AcceptedRemoteChange): Promise<ApplyRemoteResult> {
    return this.inner.applyRemote(input);
  }
}
