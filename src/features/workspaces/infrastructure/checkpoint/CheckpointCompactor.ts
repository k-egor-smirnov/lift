import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";

export class CheckpointCompactor {
  constructor(private readonly database: LiftSecureDatabase) {}

  async compact(checkpointHash: string): Promise<readonly string[]> {
    return this.database.transaction(
      "rw",
      [
        this.database.verifiedCheckpoints,
        this.database.workspaceSnapshots,
        this.database.workspaceChanges,
        this.database.syncOutbox,
        this.database.syncInbox,
        this.database.payloadFragments,
      ],
      async () => {
        const checkpoint =
          await this.database.verifiedCheckpoints.get(checkpointHash);
        if (checkpoint === undefined)
          throw new Error("Verified checkpoint is unavailable");
        const snapshot = await this.database.workspaceSnapshots.get(
          checkpoint.workspaceId
        );
        if (snapshot === undefined)
          throw new Error("Workspace snapshot is unavailable");
        const covered = new Set(checkpoint.coveredChangeHashes);
        const heads = new Set(snapshot.heads);
        const changes = await this.database.workspaceChanges
          .where("workspaceId")
          .equals(checkpoint.workspaceId)
          .toArray();
        const candidates = changes
          .filter(({ changeHash }) => covered.has(changeHash))
          .filter(({ changeHash }) => !heads.has(changeHash))
          .map(({ changeHash }) => changeHash)
          .sort();
        if (candidates.length === 0) return [];
        const candidateSet = new Set(candidates);
        const referencedByChange = changes.some(
          ({ changeHash, dependencies }) =>
            !candidateSet.has(changeHash) &&
            dependencies.some((dependency) => candidateSet.has(dependency))
        );
        const outbox = await this.database.syncOutbox
          .where("workspaceId")
          .equals(checkpoint.workspaceId)
          .toArray();
        const referencedByPendingOutbox = outbox.some(
          ({ changeHash, state }) =>
            candidateSet.has(changeHash) && state !== "acknowledged"
        );
        const pendingInbox = await this.database.syncInbox
          .where("[workspaceId+state]")
          .between(
            [checkpoint.workspaceId, "received"],
            [checkpoint.workspaceId, "waiting-keys"],
            true,
            true
          )
          .count();
        if (
          referencedByChange ||
          referencedByPendingOutbox ||
          pendingInbox > 0
        ) {
          throw new Error(
            `Checkpoint cannot compact referenced change ${candidates[0]}`
          );
        }
        const acknowledgedOutboxIds = outbox
          .filter(
            ({ changeHash, state }) =>
              candidateSet.has(changeHash) && state === "acknowledged"
          )
          .map(({ id }) => id);
        await this.database.workspaceChanges.bulkDelete(
          candidates.map((changeHash) => [checkpoint.workspaceId, changeHash])
        );
        await this.database.syncOutbox.bulkDelete(acknowledgedOutboxIds);
        const fragments = await this.database.payloadFragments
          .where("workspaceId")
          .equals(checkpoint.workspaceId)
          .filter(({ changeHash }) => candidateSet.has(changeHash))
          .toArray();
        await this.database.payloadFragments.bulkDelete(
          fragments.map(({ direction, transferId, index }) => [
            direction,
            transferId,
            index,
          ])
        );
        return candidates;
      }
    );
  }
}
