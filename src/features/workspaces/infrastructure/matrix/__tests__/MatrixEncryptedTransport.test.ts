import { describe, expect, it } from "vitest";

import { EncryptedTransportError } from "../../../application/ports/EncryptedTransport";
import type { MatrixWorkspaceClient } from "../MatrixSdkFacade";
import { MatrixEncryptedTransport } from "../MatrixEncryptedTransport";

const checkpointContent = {
  type: "dev.lift.checkpoint.v1" as const,
  schemaVersion: 1 as const,
  compression: "gzip" as const,
  workspaceId: "ws",
  authEpoch: 1,
  checkpointHash: "ab".repeat(32),
  heads: ["cd".repeat(32)],
  coveredChangeHashes: ["cd".repeat(32)],
  payload: { mode: "inline" as const, bytes: "AQID" },
};

const transportWithReadBack = (
  mutate: (
    content: Readonly<Record<string, unknown>>
  ) => Readonly<Record<string, unknown>> = (content) => content
) => {
  let sent: Readonly<Record<string, unknown>> = {};
  const client = {
    signWorkspaceContent: async (
      content: Readonly<Record<string, unknown>>
    ) => ({ ...content, signatures: { test: true } }),
    sendEncryptedWorkspaceEvent: async (
      _roomId: string,
      _innerType: string,
      content: Readonly<Record<string, unknown>>
    ) => {
      sent = content;
      return "$event";
    },
    readWorkspaceEvent: async () => ({
      wireType: "m.room.encrypted",
      clearType: "dev.lift.checkpoint.v1",
      content: mutate(sent),
    }),
  } as unknown as MatrixWorkspaceClient;
  return new MatrixEncryptedTransport({
    requireAuthenticatedClient: () => client,
  });
};

describe("MatrixEncryptedTransport", () => {
  it("accepts only an exact encrypted checkpoint read-back", async () => {
    await expect(
      transportWithReadBack().send({
        roomId: "!room:test",
        innerType: "dev.lift.checkpoint.v1",
        content: checkpointContent,
        transactionId: `lift.cp1.${checkpointContent.checkpointHash}.0`,
      })
    ).resolves.toEqual({ eventId: "$event" });

    await expect(
      transportWithReadBack((content) => ({
        ...content,
        payload: { mode: "inline", bytes: "different" },
      })).send({
        roomId: "!room:test",
        innerType: "dev.lift.checkpoint.v1",
        content: checkpointContent,
        transactionId: `lift.cp1.${checkpointContent.checkpointHash}.0`,
      })
    ).rejects.toEqual(new EncryptedTransportError("permanent"));
  });
});
