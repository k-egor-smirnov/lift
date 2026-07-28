import Dexie from "dexie";

import type { WorkspaceWriteAuthorization } from "../../application/ports/WorkspaceWriteAuthorization";
import { signingJsonBytes } from "../crypto/MatrixSigningJson";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import type { MatrixWorkspaceClient } from "../matrix/MatrixSdkFacade";
import { withMatrixRateLimitRetry } from "../matrix/MatrixControlRetry";
import { PayloadFragmenter } from "../sync/PayloadFragmenter";
import type { EncodedCheckpointV1 } from "./CheckpointCodec";
import { CheckpointCodec } from "./CheckpointCodec";
import { checkpointEnvelopeV1 } from "./CheckpointEnvelope";

const CHECKPOINT_TYPE = "dev.lift.checkpoint.v1";

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => value === right[index]);

const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

export class MatrixCheckpointPublisher {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly matrixSource:
      MatrixWorkspaceClient | (() => MatrixWorkspaceClient),
    private readonly authorization: WorkspaceWriteAuthorization,
    private readonly codec = new CheckpointCodec(),
    private readonly fragmenter = new PayloadFragmenter(),
    private readonly now: () => number = () => Date.now()
  ) {}

  async publish(workspaceId: string): Promise<EncodedCheckpointV1> {
    await this.authorization.requireEdit(workspaceId);
    const source = await this.database.transaction(
      "r",
      [
        this.database.workspaceSnapshots,
        this.database.aclCheckpoints,
        this.database.syncTargets,
      ],
      async () => {
        const snapshot =
          await this.database.workspaceSnapshots.get(workspaceId);
        const acl = await this.database.aclCheckpoints
          .where("[workspaceId+authEpoch]")
          .between(
            [workspaceId, Dexie.minKey],
            [workspaceId, Dexie.maxKey],
            true,
            true
          )
          .last();
        const target = await this.database.syncTargets
          .filter(
            ({ workspaceId: candidate, mode, state }) =>
              candidate === workspaceId &&
              mode === "active" &&
              state === "active"
          )
          .first();
        if (snapshot === undefined)
          throw new Error("Workspace snapshot is unavailable");
        if (acl === undefined) throw new Error("Workspace ACL is unavailable");
        if (target === undefined)
          throw new Error("Active Matrix workspace target is unavailable");
        return {
          snapshot: new Uint8Array([...snapshot.bytes]),
          authEpoch: acl.authEpoch,
          roomId: target.roomId,
        };
      }
    );
    const checkpoint = await this.codec.create({
      workspaceId,
      authEpoch: source.authEpoch,
      snapshot: source.snapshot,
    });
    const existing = await this.database.verifiedCheckpoints.get(
      checkpoint.hash
    );
    if (existing !== undefined) return checkpoint;
    await this.authorization.requireEdit(workspaceId);
    await this.requireCurrentSource(
      workspaceId,
      source.authEpoch,
      source.roomId
    );

    const fragments = await this.fragmenter.split(
      checkpoint.compressedSnapshot
    );
    const payloads =
      fragments.length === 0
        ? [
            {
              mode: "inline" as const,
              bytes: base64Url(checkpoint.compressedSnapshot),
            },
          ]
        : fragments.map((fragment) => ({
            mode: "fragment" as const,
            transferId: checkpoint.hash,
            index: fragment.index,
            count: fragment.count,
            fragmentHash: fragment.fragmentHash,
            bytes: base64Url(fragment.bytes),
          }));
    const matrixEventIds: string[] = [];
    const matrix = this.matrixClient();
    for (let index = 0; index < payloads.length; index += 1) {
      await this.requireCurrentSource(
        workspaceId,
        source.authEpoch,
        source.roomId
      );
      const content = checkpointEnvelopeV1.parse({
        type: CHECKPOINT_TYPE,
        schemaVersion: 1,
        compression: "gzip",
        workspaceId,
        authEpoch: checkpoint.authEpoch,
        checkpointHash: checkpoint.hash,
        heads: [...checkpoint.heads],
        coveredChangeHashes: [...checkpoint.coveredChangeHashes],
        payload: payloads[index],
      });
      const signed = await matrix.signWorkspaceContent(content);
      const eventId = await withMatrixRateLimitRetry(() =>
        matrix.sendEncryptedWorkspaceEvent(
          source.roomId,
          CHECKPOINT_TYPE,
          signed,
          `lift.cp1.${checkpoint.hash}.${index}`
        )
      );
      const readBack = await matrix.readWorkspaceEvent(source.roomId, eventId);
      if (
        readBack.wireType !== "m.room.encrypted" ||
        readBack.clearType !== CHECKPOINT_TYPE ||
        typeof readBack.content !== "object" ||
        readBack.content === null ||
        !equalBytes(
          signingJsonBytes(content),
          signingJsonBytes(readBack.content)
        )
      ) {
        throw new Error("Encrypted checkpoint read-back mismatch");
      }
      matrixEventIds.push(eventId);
    }

    await this.codec.decodeAndVerify(checkpoint, "fb".repeat(16));
    await this.authorization.requireEdit(workspaceId);
    await this.database.transaction(
      "rw",
      [
        this.database.verifiedCheckpoints,
        this.database.aclCheckpoints,
        this.database.syncTargets,
      ],
      async () => {
        await this.requireCurrentSource(
          workspaceId,
          source.authEpoch,
          source.roomId
        );
        await this.database.verifiedCheckpoints.put({
          hash: checkpoint.hash,
          workspaceId,
          schemaVersion: 1,
          authEpoch: checkpoint.authEpoch,
          heads: [...checkpoint.heads],
          coveredChangeHashes: [...checkpoint.coveredChangeHashes],
          compressedSnapshot: checkpoint.compressedSnapshot.slice(),
          matrixEventIds,
          verifiedAt: this.now(),
        });
      }
    );
    await this.pruneOldRecords(workspaceId);
    return checkpoint;
  }

  private matrixClient(): MatrixWorkspaceClient {
    return typeof this.matrixSource === "function"
      ? this.matrixSource()
      : this.matrixSource;
  }

  private async requireCurrentSource(
    workspaceId: string,
    authEpoch: number,
    roomId: string
  ): Promise<void> {
    const acl = await this.database.aclCheckpoints
      .where("[workspaceId+authEpoch]")
      .between(
        [workspaceId, Dexie.minKey],
        [workspaceId, Dexie.maxKey],
        true,
        true
      )
      .last();
    const target = await this.database.syncTargets
      .filter(
        (candidate) =>
          candidate.workspaceId === workspaceId &&
          candidate.roomId === roomId &&
          candidate.mode === "active" &&
          candidate.state === "active"
      )
      .first();
    if (acl?.authEpoch !== authEpoch || target === undefined) {
      throw new Error("Checkpoint authorization changed during publication");
    }
  }

  private async pruneOldRecords(workspaceId: string): Promise<void> {
    const records = await this.database.verifiedCheckpoints
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    const obsolete = records
      .sort(
        (left, right) =>
          right.authEpoch - left.authEpoch ||
          right.verifiedAt - left.verifiedAt ||
          right.hash.localeCompare(left.hash)
      )
      .slice(2);
    await this.database.verifiedCheckpoints.bulkDelete(
      obsolete.map(({ hash }) => hash)
    );
  }
}
