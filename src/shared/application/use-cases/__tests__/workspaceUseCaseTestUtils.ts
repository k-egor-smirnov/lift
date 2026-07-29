import { vi } from "vitest";

import type { CurrentActor } from "../../../../features/workspaces/application/ports/CurrentActor";
import type { EffectiveDateProvider } from "../../../../features/workspaces/application/ports/EffectiveDateProvider";
import type {
  WorkspaceReadModel,
  WorkspaceRepository,
  WorkspaceTaskReadModel,
} from "../../../../features/workspaces/application/ports/WorkspaceRepository";
import type { CurrentWorkspace } from "../../../../features/workspaces/application/ports/CurrentWorkspace";
import type { WorkspaceUnitOfWork } from "../../../../features/workspaces/application/ports/WorkspaceUnitOfWork";
import { WorkspaceId } from "../../../../features/workspaces/domain/WorkspaceIdentity";
import {
  createEmptyWorkspace,
  type TaskCrdtState,
  type WorkspaceState,
} from "../../../../features/workspaces/domain/WorkspaceState";

export const WORKSPACE_ID = "workspace-1";
export const ACTOR_ID = "11".repeat(16);
export const DEVICE_ID = "device-1";
export const OPERATION_ID = "operation-1";
export const AUDIT_TIME = "2026-07-22T08:00:00.000Z";
export const EFFECTIVE_DATE = "2026-07-22";
export const TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
export const LEFT_TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
export const RIGHT_TASK_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX";

export interface UseCaseTestDependencies {
  readonly workspace: CurrentWorkspace;
  readonly actor: CurrentActor;
  readonly repository: WorkspaceRepository;
  readonly unitOfWork: WorkspaceUnitOfWork;
  readonly effectiveDateProvider: EffectiveDateProvider;
  readonly state: WorkspaceState;
}

export const makeTaskState = (
  overrides: Partial<TaskCrdtState> = {}
): TaskCrdtState => {
  const category = overrides.category ?? "SIMPLE";
  return {
    id: TASK_ID,
    title: "Task",
    note: "",
    category,
    position: { key: "a1", actorId: ACTOR_ID },
    created: { deviceId: DEVICE_ID, auditTime: AUDIT_TIME },
    inboxEnteredOn: category === "INBOX" ? EFFECTIVE_DATE : null,
    deferredUntil: null,
    originalCategory: null,
    completion: "active",
    completionEpoch: 0,
    tags: { adds: {}, removedDots: {} },
    deletionDots: {},
    ...overrides,
  };
};

export const makeTaskReadModel = (
  overrides: Partial<WorkspaceTaskReadModel> = {}
): WorkspaceTaskReadModel => {
  const category = overrides.category ?? "SIMPLE";
  return {
    workspaceId: WORKSPACE_ID,
    taskId: TASK_ID,
    title: "Task",
    note: "",
    tags: [],
    category,
    completion: "active",
    positionKey: "a1",
    deferredUntil: null,
    inboxEnteredOn: category === "INBOX" ? EFFECTIVE_DATE : null,
    ...overrides,
  };
};

export const makeUseCaseDependencies = (
  includeTask = true
): UseCaseTestDependencies => {
  const state = createEmptyWorkspace(WORKSPACE_ID, "Europe/Moscow", "09:00");
  if (includeTask) state.tasks[TASK_ID] = makeTaskState();
  const workspaceModel: WorkspaceReadModel = {
    state,
    heads: [],
  };

  return {
    state,
    workspace: {
      getId: vi.fn(() => WorkspaceId(WORKSPACE_ID)),
      requireId: vi.fn(() => WorkspaceId(WORKSPACE_ID)),
    },
    actor: {
      require: vi.fn(() => ({ actorId: ACTOR_ID, deviceId: DEVICE_ID })),
      nextOperationId: vi.fn(() => OPERATION_ID),
      auditTime: vi.fn(() => AUDIT_TIME),
    },
    repository: {
      getWorkspace: vi.fn(async () => workspaceModel),
      findTask: vi.fn(async () => undefined),
      findTasks: vi.fn(async () => []),
      getTaskIdsForDay: vi.fn(async () => []),
    },
    unitOfWork: {
      commit: vi.fn(async () => ({
        workspaceId: WorkspaceId(WORKSPACE_ID),
        changeHashes: [],
        heads: [],
      })),
      applyRemote: vi.fn(),
    },
    effectiveDateProvider: {
      current: vi.fn(() => EFFECTIVE_DATE),
    },
  };
};
