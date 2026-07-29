import { afterEach, describe, expect, it } from "vitest";

import {
  ProcessInboxUseCase,
  RejectedInboxEventError,
} from "../../../application/use-cases/ProcessInboxUseCase";
import { DexieSyncInbox } from "../../database/DexieSyncInbox";
import { LiftSecureDatabase } from "../../database/LiftSecureDatabase";
import type { MatrixWorkspaceClient } from "../../matrix/MatrixSdkFacade";
import { InboxWorker } from "../InboxWorker";

const databases: LiftSecureDatabase[] = [];

const openDatabase = async (): Promise<LiftSecureDatabase> => {
  const database = new LiftSecureDatabase(
    `LiftSecureDatabase-test-${crypto.randomUUID()}`
  );
  databases.push(database);
  await database.open();
  return database;
};

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    })
  );
});

describe("durable inbox processing", () => {
  it("waits for an in-flight apply before completing the migration drain barrier", async () => {
    const database = await openDatabase();
    const inbox = new DexieSyncInbox(database);
    let releaseApply!: () => void;
    const applyGate = new Promise<void>((resolve) => {
      releaseApply = resolve;
    });
    let enteredApply!: () => void;
    const applying = new Promise<void>((resolve) => {
      enteredApply = resolve;
    });
    const process = new ProcessInboxUseCase(inbox, {
      process: async (item) => {
        enteredApply();
        await applyGate;
        await database.syncInbox.update(item.eventId, {
          state: "handled",
          lastError: null,
        });
      },
    });
    let listener:
      | ((event: {
          readonly eventId: string;
          readonly roomId: string;
          readonly wireEvent: string;
        }) => void | Promise<void>)
      | undefined;
    const matrix = {
      subscribeWorkspaceEvents: (next: typeof listener) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
      listWorkspaceWireEvents: () => [],
    } as unknown as MatrixWorkspaceClient;
    const worker = new InboxWorker(inbox, process, matrix, () => 1);
    await worker.start();
    void listener?.({
      eventId: "$in-flight",
      roomId: "!room:test",
      wireEvent: "{}",
    });
    await applying;

    let drained = false;
    const barrier = worker.pauseAndDrain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);

    releaseApply();
    await barrier;
    expect(await database.syncInbox.get("$in-flight")).toMatchObject({
      state: "handled",
    });
  });

  it("returns an interrupted event to received and applies it after restart", async () => {
    const database = await openDatabase();
    const inbox = new DexieSyncInbox(database);
    await inbox.persist(
      {
        eventId: "$event",
        roomId: "!room:test",
        wireEvent: '{"ciphertext":1}',
      },
      1
    );
    const crashing = new ProcessInboxUseCase(inbox, {
      process: async () => {
        throw new Error("simulated crash after decrypt before apply");
      },
    });
    await expect(crashing.runOnce()).rejects.toThrow("simulated crash");
    expect(await database.syncInbox.get("$event")).toMatchObject({
      state: "received",
      lastError: "interrupted-processing",
    });

    let applied = 0;
    const restarted = new ProcessInboxUseCase(inbox, {
      process: async (item) => {
        applied += 1;
        await database.syncInbox.update(item.eventId, {
          state: "handled",
          lastError: null,
        });
      },
    });
    await restarted.runOnce();
    await inbox.persist(
      {
        eventId: "$event",
        roomId: "!room:test",
        wireEvent: '{"tampered":true}',
      },
      2
    );
    expect(applied).toBe(1);
    expect(await database.syncInbox.get("$event")).toMatchObject({
      state: "handled",
      wireEvent: '{"ciphertext":1}',
    });
  });

  it("quarantines explicitly rejected hostile input", async () => {
    const database = await openDatabase();
    const inbox = new DexieSyncInbox(database);
    await inbox.persist(
      { eventId: "$hostile", roomId: "!room:test", wireEvent: "{}" },
      1
    );
    const process = new ProcessInboxUseCase(inbox, {
      process: async () => {
        throw new RejectedInboxEventError();
      },
    });
    await process.runOnce();
    expect(await database.syncInbox.get("$hostile")).toMatchObject({
      state: "quarantined",
      lastError: "rejected-encrypted-event",
    });
  });
});
