import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DurableDomainEventDispatcher } from "../../../application/services/DurableDomainEventDispatcher";
import { DexieDomainEventStore } from "../DexieDomainEventStore";
import { LiftSecureDatabase } from "../LiftSecureDatabase";
import type { DomainEventRecord } from "../records";

const databases: LiftSecureDatabase[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    databases.splice(0).map(async (database) => {
      const name = database.name;
      database.close();
      await Dexie.delete(name);
    })
  );
});

const openDatabase = async () => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

const event = (
  id: string,
  aggregateId: string,
  aggregateSequence: number
): DomainEventRecord => ({
  id,
  workspaceId: "ws_1",
  aggregateId,
  aggregateType: "Task",
  aggregateSequence,
  eventType: "TASK_CHANGED",
  payload: JSON.stringify({ id }),
  occurredAt: aggregateSequence,
  status: "pending",
  attemptCount: 0,
  nextAttemptAt: 0,
  leaseUntil: null,
  lastError: null,
});

describe("DexieDomainEventStore", () => {
  it("claims only the lowest unfinished sequence per aggregate", async () => {
    const database = await openDatabase();
    await database.domainEvents.bulkAdd([
      event("a-1", "aggregate-a", 1),
      event("a-2", "aggregate-a", 2),
      event("b-1", "aggregate-b", 1),
    ]);
    const store = new DexieDomainEventStore(database);

    expect((await store.claimNext(0, 100))?.id).toBe("a-1");
    expect((await store.claimNext(0, 100))?.id).toBe("b-1");
    await store.markDone("a-1");
    expect((await store.claimNext(0, 100))?.id).toBe("a-2");
  });

  it("redelivers an expired processing lease and preserves idempotency markers", async () => {
    const database = await openDatabase();
    await database.domainEvents.add(event("event-1", "aggregate-a", 1));
    const store = new DexieDomainEventStore(database);
    let now = 0;
    let calls = 0;
    const externalSideEffects = new Set<string>();
    const dispatcher = new DurableDomainEventDispatcher(
      store,
      [
        {
          id: "handler-1",
          async handle(item) {
            calls += 1;
            externalSideEffects.add(item.id);
          },
        },
      ],
      { now: () => now },
      () => 1,
      3,
      10
    );

    await expect(
      dispatcher.dispatchOnce({ crashAfterHandler: true })
    ).rejects.toThrow("Simulated process crash");
    now = 11;
    await expect(dispatcher.dispatchOnce()).resolves.toBe(true);

    expect(calls).toBe(2);
    expect(externalSideEffects.size).toBe(1);
    expect(await store.hasHandled("event-1", "handler-1")).toBe(true);
    expect(await database.domainEvents.get("event-1")).toMatchObject({
      status: "done",
      leaseUntil: null,
    });
  });

  it("retries with a sanitized error code and retains terminal dead letters", async () => {
    const database = await openDatabase();
    await database.domainEvents.add(event("event-1", "aggregate-a", 1));
    const store = new DexieDomainEventStore(database);
    let now = 0;
    const dispatcher = new DurableDomainEventDispatcher(
      store,
      [
        {
          id: "failing-handler",
          async handle() {
            throw new TypeError("secret-bearing detail must not persist");
          },
        },
      ],
      { now: () => now },
      () => 100,
      2,
      10
    );

    await expect(dispatcher.dispatchOnce()).rejects.toThrow(TypeError);
    expect(await database.domainEvents.get("event-1")).toMatchObject({
      status: "pending",
      attemptCount: 1,
      nextAttemptAt: 100,
      lastError: "TypeError",
    });
    now = 100;
    await expect(dispatcher.dispatchOnce()).rejects.toThrow(TypeError);
    expect(await database.domainEvents.get("event-1")).toMatchObject({
      status: "dead",
      attemptCount: 2,
      lastError: "TypeError",
    });
    expect(await store.deadLetterCount()).toBe(1);
    expect(
      JSON.stringify(await database.domainEvents.get("event-1"))
    ).not.toContain("secret-bearing");
  });
});
