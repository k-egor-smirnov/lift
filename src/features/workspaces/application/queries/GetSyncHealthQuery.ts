export type SyncHealthKind =
  | "offline-usable"
  | "sending"
  | "receiving"
  | "synced"
  | "waiting-verification"
  | "waiting-keys"
  | "authorization-paused"
  | "quarantined"
  | "error";

export interface SyncHealthSnapshot {
  readonly matrixPhase: string;
  readonly matrixLive: boolean;
  readonly pendingOutbox: number;
  readonly pendingInbox: number;
  readonly waitingKeys: number;
  readonly pausedAuthorization: number;
  readonly quarantined: number;
  readonly conflicts: number;
}

export interface SyncHealth extends SyncHealthSnapshot {
  readonly kind: SyncHealthKind;
}

/** Central, deliberately conservative definition of an honestly synced client. */
export class GetSyncHealthQuery {
  execute(snapshot: SyncHealthSnapshot): SyncHealth {
    let kind: SyncHealthKind;
    if (snapshot.pausedAuthorization > 0) kind = "authorization-paused";
    else if (snapshot.matrixPhase === "waiting-verification")
      kind = "waiting-verification";
    else if (snapshot.waitingKeys > 0) kind = "waiting-keys";
    else if (snapshot.quarantined > 0) kind = "quarantined";
    else if (snapshot.matrixPhase.startsWith("error")) kind = "error";
    else if (!snapshot.matrixLive) kind = "offline-usable";
    else if (snapshot.pendingOutbox > 0) kind = "sending";
    else if (snapshot.pendingInbox > 0) kind = "receiving";
    else kind = "synced";
    return { ...snapshot, kind };
  }
}
