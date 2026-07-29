import Dexie from "dexie";

import type { RestoredCheckpoint } from "../../application/ports/CheckpointStore";
import { CanonicalAclCodec } from "../acl/CanonicalAclCodec";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import { CheckpointCodec } from "./CheckpointCodec";

export class CheckpointRestorer {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly actorId: string,
    private readonly onRestore: (workspaceId: string) => void | Promise<void>,
    private readonly codec = new CheckpointCodec(),
    private readonly now: () => number = () => Date.now(),
    private readonly aclCodec = new CanonicalAclCodec()
  ) {}

  async restoreLatest(workspaceId: string): Promise<RestoredCheckpoint> {
    const latestAclRecord = await this.latestAcl(workspaceId);
    if (latestAclRecord === undefined)
      throw new Error("Workspace ACL is unavailable");
    const latestAcl = this.aclCodec.decode(latestAclRecord.bytes);
    const records = await this.database.verifiedCheckpoints
      .where("workspaceId")
      .equals(workspaceId)
      .filter(({ authEpoch }) => authEpoch <= latestAcl.authEpoch)
      .toArray();
    if (records.length === 0)
      throw new Error("Verified checkpoint is unavailable");
    const highestEpoch = Math.max(...records.map(({ authEpoch }) => authEpoch));
    const candidates = records
      .filter(({ authEpoch }) => authEpoch === highestEpoch)
      .sort(({ hash: left }, { hash: right }) => left.localeCompare(right));
    const verified: Array<
      Awaited<ReturnType<CheckpointCodec["decodeAndVerify"]>>
    > = [];
    for (const record of candidates) {
      const decoded = await this.codec.decodeAndVerify(
        {
          type: "dev.lift.checkpoint.v1",
          schemaVersion: 1,
          compression: "gzip",
          workspaceId: record.workspaceId,
          authEpoch: record.authEpoch,
          heads: record.heads,
          coveredChangeHashes: record.coveredChangeHashes,
          hash: record.hash,
          compressedSnapshot: new Uint8Array([...record.compressedSnapshot]),
        },
        this.actorId
      );
      const document = AutomergeWorkspaceDocument.load(
        decoded.snapshot,
        this.actorId
      );
      if (document.containsHeads(latestAcl.acceptedHeads)) {
        verified.push(decoded);
      }
    }
    if (verified.length === 0)
      throw new Error("No causally complete verified checkpoint");

    let restoredHeads: string[] = [];
    await this.database.transaction(
      "rw",
      [this.database.aclCheckpoints, this.database.workspaceSnapshots],
      async () => {
        const currentAclRecord = await this.latestAcl(workspaceId);
        if (
          currentAclRecord === undefined ||
          currentAclRecord.hash !== latestAclRecord.hash
        ) {
          throw new Error("Workspace ACL changed during checkpoint restore");
        }
        const existing =
          await this.database.workspaceSnapshots.get(workspaceId);
        const restored =
          existing === undefined
            ? AutomergeWorkspaceDocument.load(
                verified[0]!.snapshot,
                this.actorId
              )
            : AutomergeWorkspaceDocument.load(
                new Uint8Array([...existing.bytes]),
                this.actorId
              );
        for (const checkpoint of verified) {
          restored.mergeSnapshot(checkpoint.snapshot);
        }
        restoredHeads = [...restored.heads()];
        await this.database.workspaceSnapshots.put({
          workspaceId,
          schemaVersion: 1,
          bytes: restored.save(),
          heads: restoredHeads,
          savedAt: this.now(),
        });
      }
    );
    await this.onRestore(workspaceId);
    return {
      workspaceId,
      checkpointHashes: verified.map(({ hash }) => hash).sort(),
      heads: restoredHeads,
    };
  }

  private latestAcl(workspaceId: string) {
    return this.database.aclCheckpoints
      .where("[workspaceId+authEpoch]")
      .between(
        [workspaceId, Dexie.minKey],
        [workspaceId, Dexie.maxKey],
        true,
        true
      )
      .last();
  }
}
