import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SyncHealth } from "../../../application/queries/GetSyncHealthQuery";
import { SyncStatusIndicator } from "../SyncStatusIndicator";

const health = (overrides: Partial<SyncHealth> = {}): SyncHealth => ({
  kind: "synced",
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

describe("SyncStatusIndicator", () => {
  it("does not claim synchronization while an outbox item is pending", () => {
    render(
      <SyncStatusIndicator
        health={health({ kind: "sending", pendingOutbox: 1 })}
      />
    );
    expect(screen.queryByText("Синхронизировано")).not.toBeInTheDocument();
    expect(screen.getByText(/1 изм. ожидает отправки/)).toBeVisible();
  });

  it("explains that offline edits remain durable", () => {
    render(
      <SyncStatusIndicator
        health={health({ kind: "offline-usable", matrixLive: false })}
      />
    );
    expect(screen.getByText("Оффлайн · изменения сохранены")).toBeVisible();
  });

  it("makes authorization pause explicit", () => {
    render(
      <SyncStatusIndicator
        health={health({
          kind: "authorization-paused",
          pausedAuthorization: 2,
        })}
      />
    );
    expect(screen.getByText(/отправка приостановлена/)).toBeVisible();
  });
});
