import { describe, expect, it } from "vitest";

import { Sha256OfflineImportIdFactory } from "../Sha256OfflineImportIdFactory";

describe("Sha256OfflineImportIdFactory", () => {
  it("derives stable target-specific task IDs from the specified v1 preimage", async () => {
    const factory = new Sha256OfflineImportIdFactory();

    await expect(
      factory.taskId("ws_source", "task_1", "ws_target")
    ).resolves.toBe(
      "8ae84f6c20027b93e1252b1bcc53d0f1722e6f3ed096c1de74dcf54978347fa9"
    );
    await expect(
      factory.taskId("ws_source", "task_1", "ws_other")
    ).resolves.not.toBe(
      "8ae84f6c20027b93e1252b1bcc53d0f1722e6f3ed096c1de74dcf54978347fa9"
    );
  });

  it("derives the operation ID from the specified v1 preimage", async () => {
    await expect(
      new Sha256OfflineImportIdFactory().operationId("ws_source", "ws_target")
    ).resolves.toBe(
      "offline-import-v1:311dd8acd72b73cf9550e7c7cf9fce43aeafb96cbbbd827ce45498e4a0e46f46"
    );
  });

  it.each([
    [
      "task source workspace ID",
      () => factory().taskId("", "task_1", "ws_target"),
    ],
    [
      "task source task ID",
      () => factory().taskId("ws_source", "", "ws_target"),
    ],
    [
      "task target workspace ID",
      () => factory().taskId("ws_source", "task_1", ""),
    ],
    [
      "operation source workspace ID",
      () => factory().operationId("", "ws_target"),
    ],
    [
      "operation target workspace ID",
      () => factory().operationId("ws_source", ""),
    ],
  ])("rejects an empty %s", async (_label, derive) => {
    await expect(derive()).rejects.toThrow("expected a non-empty string");
  });
});

const factory = (): Sha256OfflineImportIdFactory =>
  new Sha256OfflineImportIdFactory();
