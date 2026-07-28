import { ulid } from "ulid";

import type {
  SecureRuntime,
  SecureSyncDiagnostics,
  SecureRuntimeUseCases,
} from "../../application/SecureRuntime";
import { GetSyncHealthQuery } from "../../application/queries/GetSyncHealthQuery";
import type { CurrentActor } from "../../application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../application/ports/CurrentWorkspace";
import {
  WorkspaceId,
  type WorkspaceId as WorkspaceIdValue,
} from "../../domain/WorkspaceIdentity";
import { createEmptyWorkspace } from "../../domain/WorkspaceState";
import { UpdateWorkspaceSettingsUseCase } from "../../../settings/application/use-cases/UpdateWorkspaceSettingsUseCase";
import { AddTaskToTodayUseCase } from "../../../../shared/application/use-cases/AddTaskToTodayUseCase";
import { CompleteTaskUseCase } from "../../../../shared/application/use-cases/CompleteTaskUseCase";
import { CreateTaskUseCase } from "../../../../shared/application/use-cases/CreateTaskUseCase";
import { DeferTaskUseCase } from "../../../../shared/application/use-cases/DeferTaskUseCase";
import { DeleteTaskUseCase } from "../../../../shared/application/use-cases/DeleteTaskUseCase";
import { GetTodayTasksUseCase } from "../../../../shared/application/use-cases/GetTodayTasksUseCase";
import { RemoveTaskFromTodayUseCase } from "../../../../shared/application/use-cases/RemoveTaskFromTodayUseCase";
import { ReorderTasksUseCase } from "../../../../shared/application/use-cases/ReorderTasksUseCase";
import { RevertTaskCompletionUseCase } from "../../../../shared/application/use-cases/RevertTaskCompletionUseCase";
import { UndeferTaskUseCase } from "../../../../shared/application/use-cases/UndeferTaskUseCase";
import { UpdateTaskUseCase } from "../../../../shared/application/use-cases/UpdateTaskUseCase";
import { ChangeTaskNoteUseCase } from "../../../../shared/application/use-cases/ChangeTaskNoteUseCase";
import { ChangeTaskTitleUseCase } from "../../../../shared/application/use-cases/ChangeTaskTitleUseCase";
import { UpdateTaskTagsUseCase } from "../../../../shared/application/use-cases/UpdateTaskTagsUseCase";
import { GetTaskLogsUseCase } from "../../../../shared/application/use-cases/GetTaskLogsUseCase";
import { CreateUserLogUseCase } from "../../../../shared/application/use-cases/CreateUserLogUseCase";
import { StatisticsService } from "../../../stats/application/services/StatisticsService";
import { InMemoryEventBus } from "../../../../shared/application/ports/EventBus";
import { configureSecureContainer } from "../../../../shared/infrastructure/di/container";
import { AutomergeCommandHandler } from "../crdt/AutomergeCommandHandler";
import { AutomergeWorkspaceDocument } from "../crdt/AutomergeWorkspaceDocument";
import { WorkspaceProjector } from "../crdt/WorkspaceProjector";
import { Sha256OccurrenceIdFactory } from "../crypto/Sha256OccurrenceIdFactory";
import { LocalKeyVault } from "../crypto/LocalKeyVault";
import { DexieServerProfileRepository } from "../database/DexieServerProfileRepository";
import { DexieWorkspaceRepository } from "../database/DexieWorkspaceRepository";
import { DexieWorkspaceUnitOfWork } from "../database/DexieWorkspaceUnitOfWork";
import { LiftSecureDatabase } from "../database/LiftSecureDatabase";
import { SystemEffectiveDateProvider } from "../time/SystemEffectiveDateProvider";
import { ServerProfile } from "../../domain/ServerProfile";
import { BrowserMatrixClientLease } from "../matrix/BrowserMatrixClientLease";
import { BrowserMatrixSdkFacade } from "../matrix/BrowserMatrixSdkFacade";
import { DexieMatrixSessionMetadataStore } from "../matrix/DexieMatrixSessionMetadataStore";
import { MatrixEventStoreFactory } from "../matrix/MatrixEventStoreFactory";
import { MatrixSessionManager } from "../matrix/MatrixSessionManager";
import { SecretStorageKeyCache } from "../matrix/SecretStorageKeyCache";
import { MatrixWorkspaceRoom } from "../matrix/MatrixWorkspaceRoom";
import { CreateWorkspaceUseCase } from "../../application/use-cases/CreateWorkspaceUseCase";
import { DexieSyncOutbox } from "../database/DexieSyncOutbox";
import { MatrixEncryptedTransport } from "../matrix/MatrixEncryptedTransport";
import { PayloadFragmenter } from "../sync/PayloadFragmenter";
import { retryDelay } from "../sync/RetryPolicy";
import { OutboxWorker } from "../sync/OutboxWorker";
import { ProcessOutboxUseCase } from "../../application/use-cases/ProcessOutboxUseCase";
import { DexieSyncInbox } from "../database/DexieSyncInbox";
import { MatrixAclBootstrapper } from "../acl/MatrixAclBootstrapper";
import { MatrixInboxProcessor } from "../sync/MatrixInboxProcessor";
import { MatrixMembershipGuard } from "../sync/MatrixMembershipGuard";
import { InboxWorker } from "../sync/InboxWorker";
import { ProcessInboxUseCase } from "../../application/use-cases/ProcessInboxUseCase";
import { DexieAuditLogRepository } from "../database/DexieAuditLogRepository";
import { DexieStatisticsRepository } from "../database/DexieStatisticsRepository";
import { AclControlPlane } from "../acl/AclControlPlane";
import { InviteWorkspaceMemberUseCase } from "../../application/use-cases/InviteWorkspaceMemberUseCase";
import { ChangeWorkspaceRoleUseCase } from "../../application/use-cases/ChangeWorkspaceRoleUseCase";
import { TransferWorkspaceOwnershipUseCase } from "../../application/use-cases/TransferWorkspaceOwnershipUseCase";
import { RemoveWorkspaceMemberUseCase } from "../../application/use-cases/RemoveWorkspaceMemberUseCase";
import { RevokeWorkspaceDeviceUseCase } from "../../application/use-cases/RevokeWorkspaceDeviceUseCase";
import { DexieDomainEventStore } from "../database/DexieDomainEventStore";
import { DurableDomainEventDispatcher } from "../../application/services/DurableDomainEventDispatcher";
import { DurableDomainEventWorker } from "../sync/DurableDomainEventWorker";
import { AuthorizedWorkspaceUnitOfWork } from "../../application/services/AuthorizedWorkspaceUnitOfWork";

const automergeActorId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
    value.toString(16).padStart(2, "0")
  ).join("");

class MutableCurrentWorkspace implements CurrentWorkspace {
  private value: WorkspaceIdValue | null = null;

  getId(): WorkspaceIdValue | null {
    return this.value;
  }

  requireId(): WorkspaceIdValue {
    if (this.value === null) throw new Error("No local workspace selected");
    return this.value;
  }

  set(workspaceId: string | null): void {
    this.value = workspaceId === null ? null : WorkspaceId(workspaceId);
  }
}

class BrowserCurrentActor implements CurrentActor {
  readonly actorId = automergeActorId();
  readonly deviceId = `local-${crypto.randomUUID()}`;

  require() {
    return { actorId: this.actorId, deviceId: this.deviceId };
  }

  nextOperationId(): string {
    return ulid();
  }

  auditTime(): string {
    return new Date().toISOString();
  }
}

export const createSecureRuntime = async (): Promise<SecureRuntime> => {
  const database = new LiftSecureDatabase();
  await database.open();
  const workspace = new MutableCurrentWorkspace();
  const actor = new BrowserCurrentActor();
  const existing = await database.workspaceSnapshots.toCollection().first();
  workspace.set(existing?.workspaceId ?? null);
  const existingActiveTarget =
    existing === undefined
      ? undefined
      : await database.syncTargets
          .where("workspaceId")
          .equals(existing.workspaceId)
          .filter(
            (target) => target.mode === "active" && target.state === "active"
          )
          .first();
  let setupComplete =
    existing !== undefined &&
    (import.meta.env.MODE === "test" || existingActiveTarget !== undefined);

  const effectiveDates = new SystemEffectiveDateProvider({
    now: () => new Date(),
  });
  const repository = new DexieWorkspaceRepository(database);
  const profileRepository = new DexieServerProfileRepository(database);
  const matrixProfiles = [
    ServerProfile.create({
      id: "local-primary",
      name: "Local primary",
      baseUrl: "http://127.0.0.1:8008",
    }),
    ServerProfile.create({
      id: "local-secondary",
      name: "Local migration",
      baseUrl: "http://127.0.0.1:8009",
    }),
  ];
  for (const profile of matrixProfiles) {
    if ((await profileRepository.get(profile.id)) === undefined) {
      await profileRepository.save(profile);
    }
  }
  const secretKeys = new SecretStorageKeyCache();
  const matrixSession = new MatrixSessionManager(
    profileRepository,
    new BrowserMatrixSdkFacade(secretKeys),
    new BrowserMatrixClientLease(),
    new LocalKeyVault(database),
    new MatrixEventStoreFactory(),
    secretKeys,
    new DexieMatrixSessionMetadataStore(database)
  );
  const accessControl = new AclControlPlane(database, () =>
    matrixSession.requireAuthenticatedClient()
  );
  const outboxWorker = new OutboxWorker(
    new ProcessOutboxUseCase(
      new DexieSyncOutbox(database),
      new MatrixEncryptedTransport(matrixSession),
      new PayloadFragmenter(),
      { now: () => Date.now() },
      retryDelay
    )
  );
  const domainEventStore = new DexieDomainEventStore(database);
  const domainEventWorker = new DurableDomainEventWorker(
    new DurableDomainEventDispatcher(domainEventStore, [], {
      now: () => Date.now(),
    })
  );
  domainEventWorker.start();
  const wakeOutboxOnline = () => outboxWorker.start();
  window.addEventListener("online", wakeOutboxOnline);
  const persistedUnitOfWork = new DexieWorkspaceUnitOfWork(
    database,
    new AutomergeCommandHandler(new Sha256OccurrenceIdFactory()),
    new WorkspaceProjector(),
    {
      now: () => Date.now(),
      effectiveDate: (state) => effectiveDates.current(state.settings),
    },
    () => outboxWorker.wake(),
    () => domainEventWorker.wake()
  );
  const unitOfWork = new AuthorizedWorkspaceUnitOfWork(
    persistedUnitOfWork,
    accessControl
  );
  const inboxStore = new DexieSyncInbox(database);
  let inboxWorker: InboxWorker | null = null;
  let membershipGuard: MatrixMembershipGuard | null = null;
  let inboxLifecycle = "idle";
  const startInbox = async (): Promise<void> => {
    inboxLifecycle = "starting";
    try {
      inboxWorker?.stop();
      membershipGuard?.stop();
      const matrix = matrixSession.requireAuthenticatedClient();
      membershipGuard = new MatrixMembershipGuard(database, matrix);
      await membershipGuard.start();
      const bootstrap = new MatrixAclBootstrapper(
        database,
        () => {
          const profileId = matrixSession.snapshot().profileId;
          if (profileId === null) throw new Error("Matrix profile is missing");
          return profileId;
        },
        async (workspaceId) => {
          await persistedUnitOfWork.rebuildProjections(
            workspaceId,
            actor.actorId
          );
          workspace.set(workspaceId);
          setupComplete = true;
        },
        undefined,
        undefined,
        () => ({
          userId: matrixSession.snapshot().userId,
          deviceId: matrixSession.snapshot().deviceId,
        })
      );
      inboxWorker = new InboxWorker(
        inboxStore,
        new ProcessInboxUseCase(
          inboxStore,
          new MatrixInboxProcessor(
            database,
            matrix,
            bootstrap,
            unitOfWork,
            actor.actorId
          )
        ),
        matrix
      );
      await inboxWorker.start();
      inboxLifecycle = "running";
    } catch (error) {
      membershipGuard?.stop();
      membershipGuard = null;
      inboxLifecycle = `error-${error instanceof Error ? error.name.toLowerCase() : "unknown"}`;
    }
  };
  const stopMatrixSubscription = matrixSession.subscribe((snapshot) => {
    if (snapshot.phase === "ready") {
      // Security-control events (membership, device trust and ACL) must be
      // consumed before any offline outbox row may leave this device.
      void startInbox().then(() => outboxWorker.start());
    } else {
      inboxWorker?.stop();
      inboxWorker = null;
      membershipGuard?.stop();
      membershipGuard = null;
      inboxLifecycle = "stopped";
    }
  });
  await matrixSession.resume();
  const createWorkspaceUseCase = new CreateWorkspaceUseCase(
    matrixSession,
    {
      getOrCreate: async ({ timezone, startOfDay }) => {
        const selected = workspace.getId();
        if (selected !== null) {
          const snapshot = await database.workspaceSnapshots.get(selected);
          if (snapshot === undefined) throw new Error("Workspace not found");
          return {
            workspaceId: selected,
            heads: snapshot.heads,
            snapshotBytes: snapshot.bytes.slice(),
          };
        }
        const workspaceId = WorkspaceId(`ws_${ulid()}`);
        const document = AutomergeWorkspaceDocument.create(
          createEmptyWorkspace(workspaceId, timezone, startOfDay),
          actor.actorId
        );
        const heads = [...document.heads()];
        const snapshotBytes = document.save();
        await database.workspaceSnapshots.add({
          workspaceId,
          schemaVersion: 1,
          bytes: snapshotBytes,
          heads,
          savedAt: Date.now(),
        });
        workspace.set(workspaceId);
        return { workspaceId, heads, snapshotBytes: snapshotBytes.slice() };
      },
    },
    new MatrixWorkspaceRoom(database, matrixSession),
    import.meta.env.MODE === "test"
  );
  const useCases: SecureRuntimeUseCases = {
    createTask: new CreateTaskUseCase(
      workspace,
      repository,
      unitOfWork,
      actor,
      effectiveDates
    ),
    updateTask: new UpdateTaskUseCase(
      workspace,
      repository,
      unitOfWork,
      actor,
      effectiveDates
    ),
    changeTaskTitle: new ChangeTaskTitleUseCase(
      workspace,
      repository,
      unitOfWork,
      actor
    ),
    changeTaskNote: new ChangeTaskNoteUseCase(
      workspace,
      repository,
      unitOfWork,
      actor
    ),
    updateTaskTags: new UpdateTaskTagsUseCase(
      workspace,
      repository,
      unitOfWork,
      actor
    ),
    deleteTask: new DeleteTaskUseCase(workspace, repository, unitOfWork, actor),
    reorderTasks: new ReorderTasksUseCase(
      workspace,
      repository,
      unitOfWork,
      actor
    ),
    completeTask: new CompleteTaskUseCase(
      workspace,
      repository,
      unitOfWork,
      actor,
      effectiveDates
    ),
    reopenTask: new RevertTaskCompletionUseCase(
      workspace,
      repository,
      unitOfWork,
      actor,
      effectiveDates
    ),
    getTodayTasks: new GetTodayTasksUseCase(
      workspace,
      repository,
      actor,
      effectiveDates
    ),
    addTaskToToday: new AddTaskToTodayUseCase(
      workspace,
      repository,
      unitOfWork,
      actor,
      effectiveDates
    ),
    removeTaskFromToday: new RemoveTaskFromTodayUseCase(
      workspace,
      repository,
      unitOfWork,
      actor,
      effectiveDates
    ),
    deferTask: new DeferTaskUseCase(workspace, repository, unitOfWork, actor),
    undeferTask: new UndeferTaskUseCase(
      workspace,
      repository,
      unitOfWork,
      actor
    ),
    updateWorkspaceSettings: new UpdateWorkspaceSettingsUseCase(
      workspace,
      repository,
      unitOfWork,
      actor
    ),
    getTaskLogs: new GetTaskLogsUseCase(
      workspace,
      new DexieAuditLogRepository(database)
    ),
    createUserLog: new CreateUserLogUseCase(workspace, unitOfWork, actor),
    statistics: new StatisticsService(
      workspace,
      new DexieStatisticsRepository(database)
    ),
    inviteWorkspaceMember: new InviteWorkspaceMemberUseCase(accessControl),
    changeWorkspaceRole: new ChangeWorkspaceRoleUseCase(accessControl),
    transferWorkspaceOwnership: new TransferWorkspaceOwnershipUseCase(
      accessControl
    ),
    removeWorkspaceMember: new RemoveWorkspaceMemberUseCase(accessControl),
    revokeWorkspaceDevice: new RevokeWorkspaceDeviceUseCase(accessControl),
  };

  const currentEffectiveDate = async (): Promise<string> => {
    const identity = actor.require();
    const current = await repository.getWorkspace(
      workspace.requireId(),
      identity.actorId
    );
    if (current === undefined) throw new Error("Workspace not found");
    return effectiveDates.current(current.state.settings);
  };

  const matrixTransportState = (): string => {
    if (matrixSession.snapshot().phase !== "ready") return "STOPPED";
    try {
      return (
        matrixSession.requireAuthenticatedClient().syncState?.() ?? "UNKNOWN"
      );
    } catch {
      return "STOPPED";
    }
  };
  const readSyncDiagnostics = async (): Promise<SecureSyncDiagnostics> => {
    const matrixSyncState = matrixTransportState();
    const pendingInboxRecords = await database.syncInbox
      .filter(
        ({ state }) =>
          state === "received" ||
          state === "ready" ||
          state === "waiting-dependencies"
      )
      .toArray();
    const quarantinedRecords = await database.syncInbox
      .where("state")
      .equals("quarantined")
      .toArray();

    return {
      matrixPhase: matrixSession.snapshot().phase,
      matrixSyncState,
      matrixLive:
        matrixSyncState === "PREPARED" || matrixSyncState === "SYNCING",
      inboxLifecycle,
      pendingOutbox: await database.syncOutbox
        .filter(({ state }) => state === "pending" || state === "sending")
        .count(),
      acknowledgedOutbox: await database.syncOutbox
        .where("state")
        .equals("acknowledged")
        .count(),
      pendingInbox: pendingInboxRecords.length,
      pendingReasons: [
        ...new Set(
          pendingInboxRecords
            .map(({ lastError }) => lastError)
            .filter((value): value is string => value !== null)
        ),
      ].sort(),
      pendingStates: [
        ...new Set(pendingInboxRecords.map(({ state }) => state)),
      ].sort(),
      waitingKeys: await database.syncInbox
        .where("state")
        .equals("waiting-keys")
        .count(),
      quarantined: quarantinedRecords.length,
      pausedAuthorization: await database.syncOutbox
        .where("state")
        .equals("paused-auth")
        .count(),
      conflicts: await database.conflictProjections.count(),
      deadLetters: await domainEventStore.deadLetterCount(),
      quarantineReasons: [
        ...new Set(
          quarantinedRecords
            .map(({ lastError }) => lastError)
            .filter((value): value is string => value !== null)
        ),
      ].sort(),
    };
  };
  const syncHealthQuery = new GetSyncHealthQuery();

  const runtime: SecureRuntime = {
    useCases,
    matrixSession,
    matrixProfiles: matrixProfiles.map(({ id, name, baseUrl }) => ({
      id,
      name,
      baseUrl,
    })),
    allowOfflineWorkspaceCreation: import.meta.env.MODE === "test",
    workspaceId: () => (setupComplete ? workspace.getId() : null),
    createWorkspace: async ({ timezone, startOfDay }) => {
      const workspaceId = await createWorkspaceUseCase.execute({
        timezone,
        startOfDay,
      });
      setupComplete = true;
      return workspaceId;
    },
    effectiveDate: currentEffectiveDate,
    findTasks: async () =>
      repository.findTasks({
        workspaceId: workspace.requireId(),
        effectiveDate: await currentEffectiveDate(),
      }),
    workspaceSettings: async () => {
      const identity = actor.require();
      const current = await repository.getWorkspace(
        workspace.requireId(),
        identity.actorId
      );
      if (current === undefined) throw new Error("Workspace not found");
      return { ...current.state.settings };
    },
    workspaceAcl: async () => accessControl.current(workspace.requireId()),
    syncDiagnostics: readSyncDiagnostics,
    syncHealth: async () => {
      const diagnostics = await readSyncDiagnostics();
      return syncHealthQuery.execute({
        matrixPhase: diagnostics.matrixPhase,
        matrixLive: diagnostics.matrixLive,
        pendingOutbox: diagnostics.pendingOutbox,
        pendingInbox: diagnostics.pendingInbox,
        waitingKeys: diagnostics.waitingKeys,
        pausedAuthorization: diagnostics.pausedAuthorization,
        quarantined: diagnostics.quarantined,
        conflicts: diagnostics.conflicts,
      });
    },
    stop: async () => {
      stopMatrixSubscription();
      window.removeEventListener("online", wakeOutboxOnline);
      outboxWorker.stop();
      domainEventWorker.stop();
      inboxWorker?.stop();
      await matrixSession.stop();
      database.close();
    },
  };

  configureSecureContainer({
    database,
    workspaceRepository: repository,
    workspaceUnitOfWork: unitOfWork,
    effectiveDateProvider: effectiveDates,
    eventBus: new InMemoryEventBus(),
    runtime,
  });

  return runtime;
};
