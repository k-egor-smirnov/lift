import { describe, expect, it, vi } from "vitest";

import { MatrixInviteAutoJoiner } from "../MatrixInviteAutoJoiner";

class SyncEmitter {
  private readonly listeners = new Set<(state: string) => void>();

  on(_event: "sync", listener: (state: string) => void): void {
    this.listeners.add(listener);
  }

  off(_event: "sync", listener: (state: string) => void): void {
    this.listeners.delete(listener);
  }

  emit(state: string): void {
    for (const listener of this.listeners) listener(state);
  }
}

describe("MatrixInviteAutoJoiner", () => {
  it("joins after live sync and coalesces concurrent sync notifications", async () => {
    const emitter = new SyncEmitter();
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const join = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const autoJoiner = new MatrixInviteAutoJoiner(emitter, join);
    autoJoiner.start();

    emitter.emit("ERROR");
    expect(join).not.toHaveBeenCalled();
    emitter.emit("SYNCING");
    emitter.emit("SYNCING");
    expect(join).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(2));
    autoJoiner.stop();
    emitter.emit("SYNCING");
    expect(join).toHaveBeenCalledTimes(2);
  });
});
