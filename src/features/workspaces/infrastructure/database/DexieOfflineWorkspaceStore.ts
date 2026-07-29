import type {
  OfflineWorkspaceCandidate,
  OfflineWorkspaceContent,
  OfflineWorkspaceDeletion,
  OfflineWorkspaceStore,
  OfflineWorkspaceTask,
} from "../../application/ports/OfflineWorkspaceStore";
import { comparePositions, isDeleted } from "../../domain/ConflictPolicy";
import { has } from "../../domain/ObservedRemoveSet";
import type { WorkspaceState } from "../../domain/WorkspaceState";
import { DexieWorkspaceRepository } from "./DexieWorkspaceRepository";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";

const READ_ACTOR_ID = "ff".repeat(16);

export class BoundOfflineWorkspaceError extends Error {
  constructor(readonly workspaceId: string) {
    super(`Offline workspace ${workspaceId} is bound`);
    this.name = "BoundOfflineWorkspaceError";
  }
}

const codeUnitCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export class DexieOfflineWorkspaceStore implements OfflineWorkspaceStore {
  private readonly repository: DexieWorkspaceRepository;

  constructor(private readonly database: LiftSecureDatabase) {
    this.repository = new DexieWorkspaceRepository(database);
  }

  async listCandidates(): Promise<readonly OfflineWorkspaceCandidate[]> {
    return this.database.transaction(
      "r",
      [
        this.database.workspaceSnapshots,
        this.database.workspaceMetadata,
        this.database.workspaceChanges,
        this.database.syncTargets,
        this.database.aclCheckpoints,
        this.database.migrationCertificates,
      ],
      async () => {
        const [snapshots, metadata, changes, targets, acls, certificates] =
          await Promise.all([
            this.database.workspaceSnapshots.toArray(),
            this.database.workspaceMetadata.toArray(),
            this.database.workspaceChanges.toArray(),
            this.database.syncTargets.toArray(),
            this.database.aclCheckpoints.toArray(),
            this.database.migrationCertificates.toArray(),
          ]);
        const bound = new Set([
          ...targets.map(({ workspaceId }) => workspaceId),
          ...acls.map(({ workspaceId }) => workspaceId),
          ...certificates.map(({ workspaceId }) => workspaceId),
        ]);
        const metadataByWorkspace = new Map(
          metadata.map((record) => [record.workspaceId, record.createdAt])
        );
        const earliestChangeByWorkspace = new Map<string, number>();
        for (const change of changes) {
          const current = earliestChangeByWorkspace.get(change.workspaceId);
          if (current === undefined || change.createdAt < current) {
            earliestChangeByWorkspace.set(change.workspaceId, change.createdAt);
          }
        }
        const candidates: OfflineWorkspaceCandidate[] = [];
        for (const snapshot of snapshots) {
          if (bound.has(snapshot.workspaceId)) continue;
          const document = await this.repository.loadDocument(
            snapshot.workspaceId,
            READ_ACTOR_ID
          );
          if (document === undefined) continue;
          const createdAt = metadataByWorkspace.get(snapshot.workspaceId);
          candidates.push({
            workspaceId: snapshot.workspaceId,
            createdAt:
              createdAt ??
              Math.min(
                snapshot.savedAt,
                earliestChangeByWorkspace.get(snapshot.workspaceId) ??
                  snapshot.savedAt
              ),
            createdAtSource: createdAt === undefined ? "estimated" : "metadata",
            taskCount: Object.values(document.value().tasks).filter(
              (task) => !isDeleted(task.deletionDots)
            ).length,
          });
        }
        return candidates.sort((left, right) =>
          codeUnitCompare(left.workspaceId, right.workspaceId)
        );
      }
    );
  }

  async readCandidate(workspaceId: string): Promise<OfflineWorkspaceContent> {
    return this.database.transaction(
      "r",
      [
        this.database.workspaceSnapshots,
        this.database.workspaceChanges,
        this.database.syncTargets,
        this.database.aclCheckpoints,
        this.database.migrationCertificates,
      ],
      async () => {
        await this.assertUnbound(workspaceId);
        const document = await this.repository.loadDocument(
          workspaceId,
          READ_ACTOR_ID
        );
        if (document === undefined) {
          throw new Error(`Offline workspace ${workspaceId} was not found`);
        }
        return {
          workspaceId,
          tasks: this.projectTasks(document.value()),
        };
      }
    );
  }

  async deleteCandidate(
    workspaceId: string
  ): Promise<OfflineWorkspaceDeletion> {
    return this.database.transaction(
      "rw",
      [
        this.database.workspaceSnapshots,
        this.database.workspaceMetadata,
        this.database.workspaceChanges,
        this.database.taskProjections,
        this.database.dailySelectionProjections,
        this.database.conflictProjections,
        this.database.auditProjections,
        this.database.dailyStatisticsProjections,
        this.database.syncOutbox,
        this.database.syncInbox,
        this.database.matrixEventIndex,
        this.database.verifiedCheckpoints,
        this.database.checkpointPublications,
        this.database.quarantine,
        this.database.payloadFragments,
        this.database.domainEvents,
        this.database.handledDomainEvents,
        this.database.syncTargets,
        this.database.aclCheckpoints,
        this.database.migrationCertificates,
      ],
      async () => {
        await this.assertUnbound(workspaceId);
        const domainEventIds = (
          await this.database.domainEvents
            .where("workspaceId")
            .equals(workspaceId)
            .primaryKeys()
        ).map(String);
        const artifacts: Record<string, number> = {};
        artifacts.workspaceSnapshots = await this.database.workspaceSnapshots
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.workspaceMetadata = await this.database.workspaceMetadata
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.workspaceChanges = await this.database.workspaceChanges
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.taskProjections = await this.database.taskProjections
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.dailySelectionProjections =
          await this.database.dailySelectionProjections
            .where("workspaceId")
            .equals(workspaceId)
            .delete();
        artifacts.conflictProjections = await this.database.conflictProjections
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.auditProjections = await this.database.auditProjections
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.dailyStatisticsProjections =
          await this.database.dailyStatisticsProjections
            .where("workspaceId")
            .equals(workspaceId)
            .delete();
        artifacts.syncOutbox = await this.database.syncOutbox
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.syncInbox = await this.database.syncInbox
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.matrixEventIndex = await this.database.matrixEventIndex
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.verifiedCheckpoints = await this.database.verifiedCheckpoints
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.checkpointPublications =
          await this.database.checkpointPublications
            .where("workspaceId")
            .equals(workspaceId)
            .delete();
        artifacts.quarantine = await this.database.quarantine
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.payloadFragments = await this.database.payloadFragments
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.domainEvents = await this.database.domainEvents
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
        artifacts.handledDomainEvents =
          domainEventIds.length === 0
            ? 0
            : await this.database.handledDomainEvents
                .where("eventId")
                .anyOf(domainEventIds)
                .delete();
        return { workspaceId, artifacts };
      }
    );
  }

  private async assertUnbound(workspaceId: string): Promise<void> {
    const [target, acl, certificate] = await Promise.all([
      this.database.syncTargets
        .where("workspaceId")
        .equals(workspaceId)
        .first(),
      this.database.aclCheckpoints
        .where("workspaceId")
        .equals(workspaceId)
        .first(),
      this.database.migrationCertificates
        .where("workspaceId")
        .equals(workspaceId)
        .first(),
    ]);
    if (
      target !== undefined ||
      acl !== undefined ||
      certificate !== undefined
    ) {
      throw new BoundOfflineWorkspaceError(workspaceId);
    }
  }

  private projectTasks(state: WorkspaceState): OfflineWorkspaceTask[] {
    const selectedDatesByTask = new Map<string, string[]>();
    for (const [date, selection] of Object.entries(state.dailySelections)) {
      for (const taskId of Object.keys(state.tasks)) {
        if (!has(selection, taskId)) continue;
        const dates = selectedDatesByTask.get(taskId) ?? [];
        dates.push(date);
        selectedDatesByTask.set(taskId, dates);
      }
    }
    return Object.values(state.tasks)
      .filter((task) => !isDeleted(task.deletionDots))
      .sort((left, right) =>
        comparePositions(
          { ...left.position, taskId: left.id },
          { ...right.position, taskId: right.id }
        )
      )
      .map((task) => ({
        sourceTaskId: task.id,
        title: task.title,
        note: task.note,
        category: task.category,
        deferredUntil: task.deferredUntil,
        originalCategory: task.originalCategory,
        completion: task.completion,
        inboxEnteredOn: task.inboxEnteredOn,
        tags: Object.keys(task.tags.adds)
          .filter((tag) => has(task.tags, tag))
          .sort(codeUnitCompare),
        selectedDates: (selectedDatesByTask.get(task.id) ?? []).sort(
          codeUnitCompare
        ),
      }));
  }
}
