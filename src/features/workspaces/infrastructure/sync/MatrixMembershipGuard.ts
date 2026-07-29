import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type {
  MatrixWorkspaceClient,
  MatrixWorkspaceMembershipEvent,
} from "../matrix/MatrixSdkFacade";

const isActiveMembership = (membership: string): boolean =>
  membership === "join" || membership === "invite";

/**
 * Freezes local writes when Matrix reports that this account is no longer a
 * member. A kick can race ahead of the encrypted ACL event which announced it,
 * so membership is an independent authenticated fail-closed signal.
 */
export class MatrixMembershipGuard {
  private unsubscribe: (() => void) | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly matrix: MatrixWorkspaceClient,
    private readonly now: () => number = () => Date.now()
  ) {}

  async start(): Promise<void> {
    if (this.unsubscribe !== null) return;
    const subscribe = this.matrix.subscribeWorkspaceMembership;
    if (subscribe === undefined) return;
    this.unsubscribe = subscribe.call(this.matrix, (event) =>
      this.enqueue(event)
    );

    const membership = this.matrix.workspaceMembership;
    if (membership === undefined) return;
    const targets = await this.database.syncTargets
      .filter(({ state }) => state !== "retired")
      .toArray();
    for (const target of targets) {
      const current = membership.call(this.matrix, target.roomId);
      if (current !== null && !isActiveMembership(current)) {
        await this.enqueue({
          roomId: target.roomId,
          membership: current,
        });
      }
    }
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private enqueue(event: MatrixWorkspaceMembershipEvent): Promise<void> {
    const operation = this.tail.then(() => this.apply(event));
    this.tail = operation.catch(() => undefined);
    return operation;
  }

  private async apply(event: MatrixWorkspaceMembershipEvent): Promise<void> {
    if (isActiveMembership(event.membership)) return;
    const targets = await this.database.syncTargets
      .filter(
        ({ roomId, state }) => roomId === event.roomId && state !== "retired"
      )
      .toArray();
    if (targets.length === 0) return;
    const targetIds = new Set(targets.map(({ id }) => id));
    const timestamp = this.now();
    await this.database.transaction(
      "rw",
      this.database.syncTargets,
      this.database.syncOutbox,
      async () => {
        await this.database.syncTargets.bulkUpdate(
          targets.map(({ id }) => ({
            key: id,
            changes: {
              mode: "read-only" as const,
              state: "paused" as const,
              updatedAt: timestamp,
            },
          }))
        );
        const rows = await this.database.syncOutbox
          .filter(
            ({ targetId, state }) =>
              targetIds.has(targetId) &&
              (state === "pending" || state === "sending")
          )
          .toArray();
        await this.database.syncOutbox.bulkUpdate(
          rows.map(({ id }) => ({
            key: id,
            changes: {
              state: "paused-auth" as const,
              lastError: "matrix-workspace-membership-revoked",
            },
          }))
        );
      }
    );
  }
}
