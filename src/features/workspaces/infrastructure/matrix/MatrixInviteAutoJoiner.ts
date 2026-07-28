export interface MatrixSyncEmitter {
  on(event: "sync", listener: (state: string) => void): void;
  off(event: "sync", listener: (state: string) => void): void;
}

const isLiveSync = (state: string): boolean =>
  state === "PREPARED" || state === "SYNCING";

/**
 * Reacts to invitations which arrive after the authenticated session is
 * already ready. Sync notifications are coalesced, but one additional pass is
 * retained when a notification arrives during an in-flight join.
 */
export class MatrixInviteAutoJoiner {
  private started = false;
  private running: Promise<void> | null = null;
  private rerunRequested = false;

  constructor(
    private readonly emitter: MatrixSyncEmitter,
    private readonly joinInvitedRooms: () => Promise<void>
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.emitter.on("sync", this.onSync);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.rerunRequested = false;
    this.emitter.off("sync", this.onSync);
  }

  private readonly onSync = (state: string): void => {
    if (!isLiveSync(state)) return;
    if (this.running !== null) {
      this.rerunRequested = true;
      return;
    }
    this.startJoin();
  };

  private startJoin(): void {
    this.running = this.joinInvitedRooms()
      .catch(() => undefined)
      .finally(() => {
        this.running = null;
        if (!this.started || !this.rerunRequested) return;
        this.rerunRequested = false;
        this.startJoin();
      });
  }
}
