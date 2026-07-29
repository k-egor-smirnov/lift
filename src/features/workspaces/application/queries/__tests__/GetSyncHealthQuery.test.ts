import { describe, expect, it } from "vitest";

import {
  GetSyncHealthQuery,
  type SyncHealthSnapshot,
} from "../GetSyncHealthQuery";

const snapshot = (
  overrides: Partial<SyncHealthSnapshot> = {}
): SyncHealthSnapshot => ({
  matrixPhase: "ready",
  matrixLive: true,
  pendingOutbox: 0,
  pendingInbox: 0,
  waitingKeys: 0,
  pausedAuthorization: 0,
  quarantined: 0,
  conflicts: 0,
  ...overrides,
});

describe("GetSyncHealthQuery", () => {
  const query = new GetSyncHealthQuery();

  it("never calls a merely network-connected client synced while work is pending", () => {
    expect(query.execute(snapshot({ pendingOutbox: 1 })).kind).toBe("sending");
    expect(query.execute(snapshot({ pendingInbox: 1 })).kind).toBe("receiving");
  });

  it("requires a live Matrix sync loop", () => {
    expect(query.execute(snapshot({ matrixLive: false })).kind).toBe(
      "offline-usable"
    );
    expect(query.execute(snapshot()).kind).toBe("synced");
  });

  it("prioritizes security blocks over transport progress", () => {
    expect(
      query.execute(snapshot({ pausedAuthorization: 1, pendingOutbox: 2 })).kind
    ).toBe("authorization-paused");
    expect(query.execute(snapshot({ waitingKeys: 1 })).kind).toBe(
      "waiting-keys"
    );
    expect(query.execute(snapshot({ quarantined: 1 })).kind).toBe(
      "quarantined"
    );
  });
});
