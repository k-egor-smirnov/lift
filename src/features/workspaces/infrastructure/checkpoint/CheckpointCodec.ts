import * as Automerge from "@automerge/automerge";
import { gunzipSync, gzipSync } from "fflate";

import type { WorkspaceState } from "../../domain/WorkspaceState";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";

const HASH = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

export interface EncodedCheckpointV1 {
  readonly type: "dev.lift.checkpoint.v1";
  readonly schemaVersion: 1;
  readonly compression: "gzip";
  readonly workspaceId: string;
  readonly authEpoch: number;
  readonly heads: readonly string[];
  readonly coveredChangeHashes: readonly string[];
  readonly hash: string;
  readonly compressedSnapshot: Uint8Array;
}

export interface VerifiedCheckpointV1 extends EncodedCheckpointV1 {
  readonly snapshot: Uint8Array;
}

const sortedHashes = (values: readonly string[], label: string): string[] => {
  const sorted = [...values].sort();
  if (
    sorted.length === 0 ||
    sorted.some(
      (value, index) =>
        !HASH.test(value) || (index > 0 && value === sorted[index - 1])
    )
  ) {
    throw new Error(`Invalid checkpoint ${label}`);
  }
  return sorted;
};

const checkpointHeader = (checkpoint: {
  readonly workspaceId: string;
  readonly authEpoch: number;
  readonly heads: readonly string[];
  readonly coveredChangeHashes: readonly string[];
}) =>
  encoder.encode(
    JSON.stringify({
      type: "dev.lift.checkpoint.v1",
      schemaVersion: 1,
      compression: "gzip",
      workspaceId: checkpoint.workspaceId,
      authEpoch: checkpoint.authEpoch,
      heads: checkpoint.heads,
      coveredChangeHashes: checkpoint.coveredChangeHashes,
    })
  );

const hashCheckpoint = async (
  header: Uint8Array,
  compressedSnapshot: Uint8Array
): Promise<string> => {
  const input = new Uint8Array(4 + header.length + compressedSnapshot.length);
  new DataView(input.buffer).setUint32(0, header.length, false);
  input.set(header, 4);
  input.set(compressedSnapshot, 4 + header.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
};

const allChangeHashes = (snapshot: Uint8Array): string[] => {
  const document = Automerge.load<WorkspaceState>(snapshot.slice());
  return Automerge.getAllChanges(document)
    .map((bytes) => Automerge.decodeChange(bytes).hash)
    .sort();
};

export class CheckpointCodec {
  async create(input: {
    readonly workspaceId: string;
    readonly authEpoch: number;
    readonly snapshot: Uint8Array;
  }): Promise<EncodedCheckpointV1> {
    if (input.workspaceId.trim().length === 0)
      throw new Error("Invalid checkpoint workspace");
    if (!Number.isSafeInteger(input.authEpoch) || input.authEpoch < 1)
      throw new Error("Invalid checkpoint ACL epoch");
    const document = AutomergeWorkspaceDocument.load(
      input.snapshot,
      "fa".repeat(16)
    );
    if (document.value().workspaceId !== input.workspaceId)
      throw new Error("Invalid checkpoint workspace binding");
    const heads = sortedHashes(document.heads(), "heads");
    const coveredChangeHashes = sortedHashes(
      allChangeHashes(input.snapshot),
      "covered changes"
    );
    const compressedSnapshot = gzipSync(input.snapshot, { mtime: 0 });
    const header = checkpointHeader({
      workspaceId: input.workspaceId,
      authEpoch: input.authEpoch,
      heads,
      coveredChangeHashes,
    });
    return {
      type: "dev.lift.checkpoint.v1",
      schemaVersion: 1,
      compression: "gzip",
      workspaceId: input.workspaceId,
      authEpoch: input.authEpoch,
      heads,
      coveredChangeHashes,
      hash: await hashCheckpoint(header, compressedSnapshot),
      compressedSnapshot,
    };
  }

  async decodeAndVerify(
    input: EncodedCheckpointV1,
    actorId: string
  ): Promise<VerifiedCheckpointV1> {
    if (
      input.type !== "dev.lift.checkpoint.v1" ||
      input.schemaVersion !== 1 ||
      input.compression !== "gzip" ||
      input.workspaceId.trim().length === 0 ||
      !Number.isSafeInteger(input.authEpoch) ||
      input.authEpoch < 1 ||
      !HASH.test(input.hash) ||
      !(input.compressedSnapshot instanceof Uint8Array) ||
      input.compressedSnapshot.length === 0
    ) {
      throw new Error("Invalid checkpoint schema");
    }
    const heads = sortedHashes(input.heads, "heads");
    const coveredChangeHashes = sortedHashes(
      input.coveredChangeHashes,
      "covered changes"
    );
    const header = checkpointHeader({
      workspaceId: input.workspaceId,
      authEpoch: input.authEpoch,
      heads,
      coveredChangeHashes,
    });
    if (
      (await hashCheckpoint(header, input.compressedSnapshot)) !== input.hash
    ) {
      throw new Error("Invalid checkpoint hash");
    }
    const snapshot = (() => {
      try {
        return gunzipSync(input.compressedSnapshot);
      } catch {
        throw new Error("Invalid checkpoint compression");
      }
    })();
    const document = AutomergeWorkspaceDocument.load(snapshot, actorId);
    if (
      document.value().workspaceId !== input.workspaceId ||
      JSON.stringify([...document.heads()].sort()) !== JSON.stringify(heads) ||
      JSON.stringify(allChangeHashes(snapshot)) !==
        JSON.stringify(coveredChangeHashes)
    ) {
      throw new Error("Invalid checkpoint causal frontier");
    }
    return {
      ...input,
      heads,
      coveredChangeHashes,
      compressedSnapshot: input.compressedSnapshot.slice(),
      snapshot,
    };
  }
}
