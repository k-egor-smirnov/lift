import type { CheckpointStore } from "../../application/ports/CheckpointStore";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";

export interface CheckpointSchedulePolicy {
  readonly quietPeriodMs: number;
  readonly maxIntervalMs: number;
  readonly changeThreshold: number;
}

const DEFAULT_POLICY: CheckpointSchedulePolicy = {
  quietPeriodMs: 30_000,
  maxIntervalMs: 5 * 60_000,
  changeThreshold: 25,
};

const sameHeads = (
  left: readonly string[],
  right: readonly string[]
): boolean => [...left].sort().join("\0") === [...right].sort().join("\0");

export class CheckpointScheduler {
  private timer: number | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly checkpoints: Pick<CheckpointStore, "publish">,
    private readonly currentWorkspace: () => string | null,
    private readonly now: () => number = () => Date.now(),
    private readonly policy: CheckpointSchedulePolicy = DEFAULT_POLICY,
    private readonly intervalMs = 30_000
  ) {}

  start(): void {
    if (this.timer !== null) return;
    void this.tick();
    this.timer = window.setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<boolean> {
    const workspaceId = this.currentWorkspace();
    if (workspaceId === null) return false;
    const pending = await this.database.checkpointPublications
      .where("workspaceId")
      .equals(workspaceId)
      .count();
    if (pending > 0) return false;
    const snapshot = await this.database.workspaceSnapshots.get(workspaceId);
    if (snapshot === undefined) return false;
    const verified = await this.database.verifiedCheckpoints
      .where("workspaceId")
      .equals(workspaceId)
      .toArray()
      .then(
        (records) =>
          records.sort(
            (left, right) =>
              right.authEpoch - left.authEpoch ||
              right.verifiedAt - left.verifiedAt ||
              right.hash.localeCompare(left.hash)
          )[0]
      );
    if (verified !== undefined && sameHeads(snapshot.heads, verified.heads)) {
      return false;
    }
    const quiet = this.now() - snapshot.savedAt >= this.policy.quietPeriodMs;
    const covered = new Set(verified?.coveredChangeHashes ?? []);
    const uncoveredChanges = await this.database.workspaceChanges
      .where("workspaceId")
      .equals(workspaceId)
      .filter(({ changeHash }) => !covered.has(changeHash))
      .count();
    const dueByCount = uncoveredChanges >= this.policy.changeThreshold;
    const dueByAge =
      verified === undefined
        ? quiet
        : this.now() - verified.verifiedAt >= this.policy.maxIntervalMs;
    if (!dueByCount && !(quiet && dueByAge)) return false;
    await this.checkpoints.publish(workspaceId);
    return true;
  }

  private tick(): Promise<void> {
    if (this.running !== null) return this.running;
    this.running = this.runOnce()
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
}
