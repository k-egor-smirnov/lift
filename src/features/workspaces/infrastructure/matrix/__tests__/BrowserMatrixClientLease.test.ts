import { BrowserMatrixClientLease } from "../BrowserMatrixClientLease";
import {
  matrixCryptoDatabasePrefix,
  matrixEventDatabaseName,
  MatrixEventStoreFactory,
} from "../MatrixEventStoreFactory";

class FakeLockManager {
  private readonly held = new Set<string>();

  async request<T>(
    name: string,
    options: LockOptions,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore на CI не проходит билд, надо синкануть версии TypeScript
    callback: LockGrantedCallback<T>
  ): Promise<T> {
    if (options.ifAvailable && this.held.has(name)) return callback(null);
    this.held.add(name);
    try {
      return await callback({ name, mode: "exclusive" } as Lock);
    } finally {
      this.held.delete(name);
    }
  }
}

describe("BrowserMatrixClientLease", () => {
  it("gives one tab exclusive ownership of a crypto namespace", async () => {
    const manager = new BrowserMatrixClientLease(
      new FakeLockManager() as unknown as LockManager
    );
    const first = await manager.acquire("crypto-prefix");
    expect(first).not.toBeNull();
    expect(await manager.acquire("crypto-prefix")).toBeNull();
    first?.release();
    await Promise.resolve();
    await Promise.resolve();
    const next = await manager.acquire("crypto-prefix");
    expect(next).not.toBeNull();
    next?.release();
  });

  it("uses collision-free profile/user/device database namespaces", async () => {
    const names = new Set([
      matrixCryptoDatabasePrefix("p1", "@alice:a", "A"),
      matrixCryptoDatabasePrefix("p2", "@alice:a", "A"),
      matrixCryptoDatabasePrefix("p1", "@alice:a", "B"),
      matrixEventDatabaseName("p1", "@alice:a", "A"),
      matrixEventDatabaseName("p2", "@alice:a", "A"),
      matrixEventDatabaseName("p1", "@alice:a", "B"),
    ]);
    expect(names).toHaveLength(6);
    expect(matrixCryptoDatabasePrefix("p1", "@alice:a", "A")).toBe(
      "lift-matrix-crypto:p1:%40alice%3Aa:A"
    );
    expect(matrixEventDatabaseName("p1", "@alice:a", "A")).toBe(
      "lift-matrix-events:p1:%40alice%3Aa:A"
    );

    class FakeStore {
      constructor(readonly options: { dbName: string }) {}
    }
    const store = await new MatrixEventStoreFactory(
      indexedDB,
      undefined,
      async () => FakeStore as never
    ).create("p1", "@alice:a", "A");
    expect((store as unknown as FakeStore).options.dbName).toBe(
      "lift-matrix-events:p1:%40alice%3Aa:A"
    );
  });
});
