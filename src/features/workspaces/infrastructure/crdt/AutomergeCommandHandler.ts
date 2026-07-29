import * as Automerge from "@automerge/automerge";
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

import type {
  ImportedTaskState,
  WorkspaceCommand,
} from "../../application/commands/WorkspaceCommand";
import type { OccurrenceIdFactory } from "../../application/ports/OccurrenceIdFactory";
import { comparePositions, isDeleted } from "../../domain/ConflictPolicy";
import { isValidDateOnly } from "../../domain/EffectiveDate";
import { enumerateOccurrenceDates } from "../../domain/Recurrence";
import type {
  ObservedRemoveSet,
  TaskCrdtState,
  WorkspaceState,
} from "../../domain/WorkspaceState";
import {
  AutomergeWorkspaceDocument,
  WORKSPACE_GENESIS_ACTOR_ID,
  type BinaryWorkspaceChange,
} from "./AutomergeWorkspaceDocument";
import { requireAutomergeActorId } from "./ActorIdFactory";

const START_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const AUDIT_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const requireNonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return value;
};

const requireAuditTime = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !AUDIT_INSTANT_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error("Invalid auditTime");
  }
  return value;
};

const requireCategory = (value: unknown): "INBOX" | "SIMPLE" | "FOCUS" => {
  if (value !== "INBOX" && value !== "SIMPLE" && value !== "FOCUS") {
    throw new Error("Invalid task category");
  }
  return value;
};

const requireDate = (value: unknown, field: string): string => {
  if (!isValidDateOnly(value)) {
    throw new Error(`Invalid ${field} date`);
  }
  return value;
};

const requireTimezone = (value: unknown): string => {
  const timezone = requireNonEmpty(value, "timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error("Invalid timezone");
  }
  return timezone;
};

const requireTask = (
  state: Readonly<WorkspaceState>,
  taskIdValue: unknown
): Readonly<TaskCrdtState> => {
  const taskId = requireNonEmpty(taskIdValue, "taskId");
  const task = state.tasks[taskId];
  if (task === undefined) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
};

const requireEditableTask = (
  state: Readonly<WorkspaceState>,
  taskIdValue: unknown
): Readonly<TaskCrdtState> => {
  const task = requireTask(state, taskIdValue);
  if (isDeleted(task.deletionDots)) {
    throw new Error(`Cannot edit deleted task: ${task.id}`);
  }
  return task;
};

const isUtf16Boundary = (text: string, index: number): boolean => {
  if (index <= 0 || index >= text.length) {
    return true;
  }
  const previous = text.charCodeAt(index - 1);
  const next = text.charCodeAt(index);
  return !(
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    next >= 0xdc00 &&
    next <= 0xdfff
  );
};

const sortedStringRecord = (
  value: Readonly<Record<string, string>>
): Record<string, string> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid audit data");
  }
  const result: Record<string, string> = {};
  for (const key of Object.keys(value).sort()) {
    requireNonEmpty(key, "audit data key");
    const entry = value[key];
    if (typeof entry !== "string") {
      throw new Error("Invalid audit data value");
    }
    result[key] = entry;
  }
  return result;
};

interface PositionInput {
  readonly leftTaskId?: string | null;
  readonly rightTaskId?: string | null;
}

interface MovePositionAssignment {
  readonly taskId: string;
  readonly key: string;
}

const canonicalTaskOrder = (
  left: Readonly<TaskCrdtState>,
  right: Readonly<TaskCrdtState>
): number =>
  comparePositions(
    { ...left.position, taskId: left.id },
    { ...right.position, taskId: right.id }
  );

const positionKey = (
  state: Readonly<WorkspaceState>,
  input: PositionInput,
  movingTaskId?: string
): string => {
  const readNeighbor = (
    value: string | null | undefined,
    side: "left" | "right"
  ): Readonly<TaskCrdtState> | undefined => {
    if (value === null || value === undefined) {
      return undefined;
    }
    const neighborId = requireNonEmpty(value, `${side}TaskId`);
    if (neighborId === movingTaskId) {
      throw new Error("A task cannot be its own position neighbor");
    }
    return requireEditableTask(state, neighborId);
  };

  const left = readNeighbor(input.leftTaskId, "left");
  const right = readNeighbor(input.rightTaskId, "right");
  if (
    left !== undefined &&
    right !== undefined &&
    left.position.key >= right.position.key
  ) {
    throw new Error("Invalid task position bounds");
  }
  try {
    return generateKeyBetween(
      left?.position.key ?? null,
      right?.position.key ?? null
    );
  } catch {
    throw new Error("Invalid task position bounds");
  }
};

const movePositionAssignments = (
  state: Readonly<WorkspaceState>,
  input: PositionInput,
  movingTask: Readonly<TaskCrdtState>
): readonly MovePositionAssignment[] => {
  const readNeighbor = (
    value: string | null | undefined,
    side: "left" | "right"
  ): Readonly<TaskCrdtState> | undefined => {
    if (value === null || value === undefined) return undefined;
    const taskId = requireNonEmpty(value, `${side}TaskId`);
    if (taskId === movingTask.id) {
      throw new Error("A task cannot be its own position neighbor");
    }
    return requireEditableTask(state, taskId);
  };
  const left = readNeighbor(input.leftTaskId, "left");
  const right = readNeighbor(input.rightTaskId, "right");
  if (
    left !== undefined &&
    right !== undefined &&
    canonicalTaskOrder(left, right) >= 0
  ) {
    throw new Error("Invalid task position bounds");
  }

  const remaining = Object.values(state.tasks)
    .filter(
      (task) => task.id !== movingTask.id && !isDeleted(task.deletionDots)
    )
    .sort(canonicalTaskOrder);
  const insertionIndex =
    left === undefined
      ? 0
      : remaining.findIndex(({ id }) => id === left.id) + 1;
  if (
    insertionIndex < 0 ||
    (right !== undefined && remaining[insertionIndex]?.id !== right.id) ||
    (right === undefined && insertionIndex !== remaining.length)
  ) {
    throw new Error(
      "Invalid task position bounds: left and right must be actual canonical neighbours"
    );
  }
  if (remaining.length === 0 && left === undefined && right === undefined) {
    return [];
  }

  if (left?.position.key !== right?.position.key) {
    try {
      return [
        {
          taskId: movingTask.id,
          key: generateKeyBetween(
            left?.position.key ?? null,
            right?.position.key ?? null
          ),
        },
      ];
    } catch {
      throw new Error("Invalid task position bounds");
    }
  }

  if (left === undefined || right === undefined) {
    throw new Error("Invalid task position bounds");
  }
  const ordered = [...remaining];
  ordered.splice(insertionIndex, 0, movingTask);
  const keys = generateNKeysBetween(null, null, ordered.length);
  return ordered.map((task, index) => ({
    taskId: task.id,
    key: keys[index]!,
  }));
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

const textOperationIdentity = async (
  command: Extract<WorkspaceCommand, { type: "SpliceTaskText" }>
): Promise<{ readonly actorId: string; readonly message: string }> => {
  const authorActor = requireAutomergeActorId(command.actorId);
  if (authorActor === WORKSPACE_GENESIS_ACTOR_ID) {
    throw new Error("Invalid operation author: reserved genesis actor");
  }
  const operationActor = await sha256Hex(
    `dev.lift.automerge.operation-actor.v1\0${authorActor}\0${command.operationId}`
  );
  if (operationActor === WORKSPACE_GENESIS_ACTOR_ID) {
    throw new Error("Invalid derived operation actor: reserved genesis actor");
  }
  const baseHeads = Array.isArray(command.baseHeads)
    ? [...command.baseHeads].sort()
    : command.baseHeads;
  const semantic = JSON.stringify({
    version: 1,
    workspaceId: command.workspaceId,
    actorId: authorActor,
    operationId: command.operationId,
    taskId: command.taskId,
    path: command.path,
    baseHeads,
    index: command.index,
    deleteCount: command.deleteCount,
    insert: command.insert,
  });
  const semanticDigest = await sha256Hex(
    `dev.lift.splice-task-text.v1\0${semantic}`
  );
  return {
    actorId: operationActor,
    message: `dev.lift.splice-task-text.v1:${semanticDigest}`,
  };
};

const validateBase = (
  state: Readonly<WorkspaceState>,
  command: WorkspaceCommand
): void => {
  const workspaceId = requireNonEmpty(command.workspaceId, "workspaceId");
  requireNonEmpty(command.actorId, "actorId");
  requireNonEmpty(command.operationId, "operationId");
  if (state.workspaceId !== workspaceId) {
    throw new Error("Workspace command targets a different workspace");
  }
};

interface ValidatedOfflineImport {
  readonly sourceWorkspaceId: string;
  readonly deviceId: string;
  readonly auditTime: string;
  readonly tasks: readonly ImportedTaskState[];
}

const requireNullableDate = (value: unknown, field: string): string | null =>
  value === null ? null : requireDate(value, field);

const requireNullableCategory = (
  value: unknown
): TaskCrdtState["originalCategory"] =>
  value === null ? null : requireCategory(value);

const requireImportedTags = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new Error("Invalid tags: expected a sorted unique array");
  }
  const tags = value.map((tag) => requireNonEmpty(tag, "tag"));
  for (let index = 1; index < tags.length; index += 1) {
    if (tags[index - 1]! >= tags[index]!) {
      throw new Error("Invalid tags: expected a sorted unique array");
    }
  }
  return tags;
};

const requireSelectedDates = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    throw new Error("Invalid selectedDates: expected an array");
  }
  const dates = value.map((date) => requireDate(date, "selection"));
  if (new Set(dates).size !== dates.length) {
    throw new Error("Invalid selectedDates: expected unique dates");
  }
  return dates;
};

const validateOfflineImport = (
  state: Readonly<WorkspaceState>,
  command: Extract<WorkspaceCommand, { type: "ImportOfflineWorkspace" }>
): ValidatedOfflineImport => {
  const sourceWorkspaceId = requireNonEmpty(
    command.sourceWorkspaceId,
    "sourceWorkspaceId"
  );
  if (sourceWorkspaceId === state.workspaceId) {
    throw new Error("Offline import source and target workspaces must differ");
  }
  const deviceId = requireNonEmpty(command.deviceId, "deviceId");
  const auditTime = requireAuditTime(command.auditTime);
  if (!Array.isArray(command.tasks)) {
    throw new Error("Invalid imported tasks: expected an array");
  }

  const sourceTaskIds = new Set<string>();
  const targetTaskIds = new Set<string>();
  const tasks = command.tasks.map((task): ImportedTaskState => {
    if (typeof task !== "object" || task === null) {
      throw new Error("Invalid imported task");
    }
    const sourceTaskId = requireNonEmpty(task.sourceTaskId, "sourceTaskId");
    const targetTaskId = requireNonEmpty(task.targetTaskId, "targetTaskId");
    if (sourceTaskIds.has(sourceTaskId)) {
      throw new Error("Imported source task IDs must be unique");
    }
    if (targetTaskIds.has(targetTaskId)) {
      throw new Error("Imported target task IDs must be unique");
    }
    sourceTaskIds.add(sourceTaskId);
    targetTaskIds.add(targetTaskId);

    const title = requireNonEmpty(task.title, "title");
    if (typeof task.note !== "string") {
      throw new Error("Invalid note");
    }
    const category = requireCategory(task.category);
    const deferredUntil = requireNullableDate(
      task.deferredUntil,
      "deferredUntil"
    );
    const originalCategory = requireNullableCategory(task.originalCategory);
    if (task.completion !== "active" && task.completion !== "completed") {
      throw new Error("Invalid task completion");
    }
    const inboxEnteredOn = requireNullableDate(
      task.inboxEnteredOn,
      "inboxEnteredOn"
    );
    const tags = requireImportedTags(task.tags);
    const selectedDates = requireSelectedDates(task.selectedDates);

    return {
      sourceTaskId,
      targetTaskId,
      title,
      note: task.note,
      category,
      deferredUntil,
      originalCategory,
      completion: task.completion,
      inboxEnteredOn,
      tags,
      selectedDates,
    };
  });

  return { sourceWorkspaceId, deviceId, auditTime, tasks };
};

const activeSetMembers = (
  set: Readonly<ObservedRemoveSet>
): readonly string[] =>
  Object.keys(set.adds)
    .filter((element) =>
      Object.keys(set.adds[element] ?? {}).some(
        (dot) => !Object.hasOwn(set.removedDots, dot)
      )
    )
    .sort();

const equalStringArrays = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const selectedDatesForTask = (
  state: Readonly<WorkspaceState>,
  taskId: string
): readonly string[] =>
  Object.keys(state.dailySelections)
    .filter((date) => {
      const selection = state.dailySelections[date]!;
      return Object.keys(selection.adds[taskId] ?? {}).some(
        (dot) => !Object.hasOwn(selection.removedDots, dot)
      );
    })
    .sort();

const hasExactImportProvenance = (
  task: Readonly<TaskCrdtState>,
  sourceWorkspaceId: string,
  sourceTaskId: string,
  targetWorkspaceId: string
): boolean =>
  task.importedFrom?.version === "lift-offline-import-v1" &&
  task.importedFrom.sourceWorkspaceId === sourceWorkspaceId &&
  task.importedFrom.sourceTaskId === sourceTaskId &&
  task.importedFrom.targetWorkspaceId === targetWorkspaceId;

const hasExactImportedContent = (
  state: Readonly<WorkspaceState>,
  task: Readonly<TaskCrdtState>,
  imported: Readonly<ImportedTaskState>,
  deviceId: string,
  auditTime: string
): boolean =>
  task.title === imported.title &&
  task.note === imported.note &&
  task.category === imported.category &&
  task.created.deviceId === deviceId &&
  task.created.auditTime === auditTime &&
  task.inboxEnteredOn === imported.inboxEnteredOn &&
  task.deferredUntil === imported.deferredUntil &&
  task.originalCategory === imported.originalCategory &&
  task.completion === imported.completion &&
  (task.completionBaselineEpoch ?? 0) ===
    (imported.completion === "completed" ? 1 : 0) &&
  task.completionEpoch === (imported.completion === "completed" ? 1 : 0) &&
  equalStringArrays(activeSetMembers(task.tags), imported.tags) &&
  equalStringArrays(
    selectedDatesForTask(state, task.id),
    [...imported.selectedDates].sort()
  );

const hasExactImportAudit = (
  state: Readonly<WorkspaceState>,
  command: Extract<WorkspaceCommand, { type: "ImportOfflineWorkspace" }>,
  imported: Readonly<ValidatedOfflineImport>
): boolean => {
  const record = state.auditRecords[command.operationId];
  return (
    record !== undefined &&
    record.id === command.operationId &&
    record.kind === "offline.workspace-imported.v1" &&
    record.taskId === null &&
    record.effectiveDate === null &&
    record.actorId === command.actorId &&
    record.auditTime === imported.auditTime &&
    equalStringArrays(Object.keys(record.data).sort(), [
      "importedTaskCount",
      "sourceWorkspaceId",
    ]) &&
    record.data.sourceWorkspaceId === imported.sourceWorkspaceId &&
    record.data.importedTaskCount === String(imported.tasks.length)
  );
};

const importDot = (
  operationId: string,
  targetTaskId: string,
  kind: "tag" | "day",
  value: string
): Promise<string> =>
  sha256Hex(
    `dev.lift.offline-import-${kind}-dot.v1\0${operationId}\0${targetTaskId}\0${value}`
  );

const completionChange = (
  document: AutomergeWorkspaceDocument,
  command: Extract<WorkspaceCommand, { type: "CompleteTask" | "ReopenTask" }>
): BinaryWorkspaceChange[] => {
  const state = document.value();
  const task = requireEditableTask(state, command.taskId);
  const effectiveDate = requireDate(command.effectiveDate, "effective");
  const auditTime = requireAuditTime(command.auditTime);
  const completion = command.type === "CompleteTask" ? "completed" : "active";
  const kind = command.type === "CompleteTask" ? "completed" : "reopened";
  const categoryAtCompletion =
    command.type === "CompleteTask"
      ? requireCategory(command.categoryAtCompletion)
      : null;
  const existing = state.completionRecords[command.operationId];
  if (existing !== undefined) {
    if (
      existing.taskId === task.id &&
      existing.effectiveDate === effectiveDate &&
      existing.kind === kind &&
      existing.categoryAtCompletion === categoryAtCompletion &&
      existing.actorId === command.actorId &&
      existing.auditTime === auditTime
    ) {
      return [];
    }
    throw new Error("operationId already identifies another completion record");
  }
  if (task.completion === completion) {
    return [];
  }
  if (
    command.type === "CompleteTask" &&
    task.category !== categoryAtCompletion
  ) {
    throw new Error(
      "Completion category does not match canonical task category"
    );
  }
  const fromCompletionEpoch = task.completionEpoch;
  const completionEpoch = fromCompletionEpoch + 1;

  return document.change(command.type, (draft) => {
    draft.tasks[task.id].completion = completion;
    draft.tasks[task.id].completionEpoch = completionEpoch;
    draft.completionRecords[command.operationId] = {
      id: command.operationId,
      taskId: task.id,
      effectiveDate,
      kind,
      fromCompletionEpoch,
      completionEpoch,
      categoryAtCompletion,
      actorId: command.actorId,
      auditTime,
    };
  });
};

/** Maps validated semantic commands to deterministic Automerge operations. */
export class AutomergeCommandHandler {
  constructor(private readonly occurrenceIds: OccurrenceIdFactory) {}

  async handle(
    document: AutomergeWorkspaceDocument,
    command: WorkspaceCommand
  ): Promise<readonly BinaryWorkspaceChange[]> {
    const state = document.value();
    validateBase(state, command);

    switch (command.type) {
      case "CreateTask": {
        const taskId = requireNonEmpty(command.taskId, "taskId");
        const title = requireNonEmpty(command.title, "title");
        const note = command.note ?? "";
        if (typeof note !== "string") {
          throw new Error("Invalid note");
        }
        const category = requireCategory(command.category);
        const effectiveDate = requireDate(command.effectiveDate, "effective");
        const addToDate =
          command.addToDate === undefined
            ? undefined
            : requireDate(command.addToDate, "selection");
        const deviceId = requireNonEmpty(command.deviceId, "deviceId");
        const auditTime = requireAuditTime(command.auditTime);
        if (state.tasks[taskId] !== undefined) {
          throw new Error(`Task already exists: ${taskId}`);
        }
        const key = positionKey(state, command);
        return document.change(command.type, (draft) => {
          draft.tasks[taskId] = {
            id: taskId,
            title,
            note,
            category,
            position: { key, actorId: command.actorId },
            created: { deviceId, auditTime },
            inboxEnteredOn: category === "INBOX" ? effectiveDate : null,
            deferredUntil: null,
            originalCategory: null,
            completion: "active",
            completionEpoch: 0,
            tags: { adds: {}, removedDots: {} },
            deletionDots: {},
          };
          if (addToDate !== undefined) {
            if (draft.dailySelections[addToDate] === undefined) {
              draft.dailySelections[addToDate] = {
                adds: {},
                removedDots: {},
              };
            }
            draft.dailySelections[addToDate]!.adds[taskId] = {
              [command.operationId]: true,
            };
          }
        });
      }
      case "SpliceTaskText": {
        requireEditableTask(state, command.taskId);
        if (command.path !== "title" && command.path !== "note") {
          throw new Error("Invalid task text path");
        }
        if (
          !Number.isSafeInteger(command.index) ||
          !Number.isSafeInteger(command.deleteCount) ||
          command.index < 0 ||
          command.deleteCount < 0 ||
          typeof command.insert !== "string"
        ) {
          throw new Error("Invalid UTF-16 splice");
        }
        const baseState = document.valueAt(command.baseHeads);
        const task = requireEditableTask(baseState, command.taskId);
        const current = task[command.path];
        const end = command.index + command.deleteCount;
        if (
          command.index > current.length ||
          end > current.length ||
          !isUtf16Boundary(current, command.index) ||
          !isUtf16Boundary(current, end)
        ) {
          throw new Error("Invalid UTF-16 splice boundary");
        }
        const next =
          current.slice(0, command.index) + command.insert + current.slice(end);
        if (command.path === "title" && next.trim().length === 0) {
          throw new Error("Invalid title: expected a non-empty string");
        }
        const operation = await textOperationIdentity(command);
        if (next === current) {
          return document.changeAt(
            command.baseHeads,
            operation.actorId,
            operation.message,
            () => undefined
          );
        }
        return document.changeAt(
          command.baseHeads,
          operation.actorId,
          operation.message,
          (draft) => {
            Automerge.splice(
              draft,
              ["tasks", task.id, command.path],
              command.index,
              command.deleteCount,
              command.insert
            );
          }
        );
      }
      case "ChangeTaskCategory": {
        const taskId = requireNonEmpty(command.taskId, "taskId");
        const fromCategory = requireCategory(command.fromCategory);
        const category = requireCategory(command.category);
        const effectiveDate = requireDate(command.effectiveDate, "effective");
        const auditTime = requireAuditTime(command.auditTime);
        const existing = state.auditRecords[command.operationId];
        if (existing !== undefined) {
          if (
            existing.kind === "task.category-changed.v1" &&
            existing.taskId === taskId &&
            existing.effectiveDate === effectiveDate &&
            existing.actorId === command.actorId &&
            existing.auditTime === auditTime &&
            existing.data.fromCategory === fromCategory &&
            existing.data.toCategory === category
          ) {
            return [];
          }
          throw new Error(
            "operationId already identifies another audit record"
          );
        }
        const task = requireEditableTask(state, taskId);
        if (task.category !== fromCategory) {
          throw new Error(
            "Category claim does not match canonical task category"
          );
        }
        if (category === fromCategory) return [];
        const firstInboxReview =
          fromCategory === "INBOX" &&
          category !== "INBOX" &&
          !Object.values(state.auditRecords).some(
            (record) =>
              record.kind === "task.category-changed.v1" &&
              record.taskId === task.id &&
              record.data.firstInboxReview === "true"
          );
        return document.change(command.type, (draft) => {
          draft.tasks[task.id].category = category;
          if (fromCategory !== "INBOX" && category === "INBOX") {
            draft.tasks[task.id].inboxEnteredOn = effectiveDate;
          }
          if (draft.tasks[task.id].deferredUntil !== null) {
            draft.tasks[task.id].originalCategory = category;
          }
          draft.auditRecords[command.operationId] = {
            id: command.operationId,
            kind: "task.category-changed.v1",
            taskId: task.id,
            effectiveDate,
            actorId: command.actorId,
            auditTime,
            data: {
              firstInboxReview: firstInboxReview ? "true" : "false",
              fromCategory,
              toCategory: category,
            },
          };
        });
      }
      case "MoveTask": {
        const task = requireEditableTask(state, command.taskId);
        const assignments = movePositionAssignments(state, command, task);
        if (assignments.length === 0) return [];
        return document.change(command.type, (draft) => {
          for (const assignment of assignments) {
            draft.tasks[assignment.taskId].position.key = assignment.key;
          }
          draft.tasks[task.id].position.actorId = command.actorId;
        });
      }
      case "CompleteTask":
      case "ReopenTask":
        return completionChange(document, command);
      case "DeferTask": {
        const task = requireEditableTask(state, command.taskId);
        const deferredUntil =
          command.deferredUntil === null
            ? null
            : requireDate(command.deferredUntil, "deferredUntil");
        return document.change(command.type, (draft) => {
          const target = draft.tasks[task.id];
          if (deferredUntil === null) {
            if (target.originalCategory !== null) {
              target.category = target.originalCategory;
            }
            target.deferredUntil = null;
            target.originalCategory = null;
          } else {
            if (target.deferredUntil === null) {
              target.originalCategory = target.category;
            }
            target.deferredUntil = deferredUntil;
          }
        });
      }
      case "DeleteTask": {
        const task = requireEditableTask(state, command.taskId);
        return document.change(command.type, (draft) => {
          draft.tasks[task.id].deletionDots[command.operationId] = true;
        });
      }
      case "AddTag": {
        const task = requireEditableTask(state, command.taskId);
        const tag = requireNonEmpty(command.tag, "tag");
        return document.change(command.type, (draft) => {
          const dots = draft.tasks[task.id].tags.adds[tag] ?? {};
          dots[command.operationId] = true;
          draft.tasks[task.id].tags.adds[tag] = dots;
        });
      }
      case "RemoveTag": {
        const task = requireEditableTask(state, command.taskId);
        const tag = requireNonEmpty(command.tag, "tag");
        return document.change(command.type, (draft) => {
          const target = draft.tasks[task.id].tags;
          for (const dot of Object.keys(target.adds[tag] ?? {})) {
            target.removedDots[dot] = true;
          }
        });
      }
      case "AddToDay": {
        const task = requireEditableTask(state, command.taskId);
        const date = requireDate(command.date, "selection");
        return document.change(command.type, (draft) => {
          if (draft.dailySelections[date] === undefined) {
            draft.dailySelections[date] = { adds: {}, removedDots: {} };
          }
          if (draft.dailySelections[date]!.adds[task.id] === undefined) {
            draft.dailySelections[date]!.adds[task.id] = {};
          }
          draft.dailySelections[date]!.adds[task.id]![command.operationId] =
            true;
        });
      }
      case "RemoveFromDay": {
        const task = requireEditableTask(state, command.taskId);
        const date = requireDate(command.date, "selection");
        return document.change(command.type, (draft) => {
          const selection = draft.dailySelections[date];
          if (selection === undefined) {
            return;
          }
          for (const dot of Object.keys(selection.adds[task.id] ?? {})) {
            selection.removedDots[dot] = true;
          }
        });
      }
      case "UpdateWorkspaceSettings": {
        if (
          command.timezone === undefined &&
          command.startOfDay === undefined
        ) {
          throw new Error("Workspace settings patch is empty");
        }
        if (
          (command.timezone === undefined) !==
            (command.fromTimezone === undefined) ||
          (command.startOfDay === undefined) !==
            (command.fromStartOfDay === undefined)
        ) {
          throw new Error(
            "Workspace settings patch is missing its prior value"
          );
        }
        const timezone =
          command.timezone === undefined
            ? undefined
            : requireTimezone(command.timezone);
        if (
          command.startOfDay !== undefined &&
          (typeof command.startOfDay !== "string" ||
            !START_OF_DAY_PATTERN.test(command.startOfDay))
        ) {
          throw new Error("Invalid startOfDay");
        }
        const auditTime = requireAuditTime(command.auditTime);
        const data: Record<string, string> = {};
        if (timezone !== undefined) {
          data.timezoneFrom = requireTimezone(command.fromTimezone);
          data.timezoneTo = timezone;
        }
        if (command.startOfDay !== undefined) {
          if (
            typeof command.fromStartOfDay !== "string" ||
            !START_OF_DAY_PATTERN.test(command.fromStartOfDay)
          ) {
            throw new Error("Invalid prior startOfDay");
          }
          data.startOfDayFrom = command.fromStartOfDay;
          data.startOfDayTo = command.startOfDay;
        }
        const existing = state.auditRecords[command.operationId];
        if (existing !== undefined) {
          if (
            existing.kind === "workspace.settings-changed.v1" &&
            existing.taskId === null &&
            existing.effectiveDate === null &&
            existing.actorId === command.actorId &&
            existing.auditTime === auditTime &&
            JSON.stringify(existing.data) ===
              JSON.stringify(sortedStringRecord(data))
          ) {
            return [];
          }
          throw new Error(
            "operationId already identifies another audit record"
          );
        }
        if (
          timezone !== undefined &&
          state.settings.timezone !== command.fromTimezone &&
          state.settings.timezone !== timezone
        ) {
          throw new Error(
            "Workspace timezone changed since the command was prepared"
          );
        }
        if (
          command.startOfDay !== undefined &&
          state.settings.startOfDay !== command.fromStartOfDay &&
          state.settings.startOfDay !== command.startOfDay
        ) {
          throw new Error(
            "Workspace startOfDay changed since the command was prepared"
          );
        }
        return document.change(command.type, (draft) => {
          if (timezone !== undefined) draft.settings.timezone = timezone;
          if (command.startOfDay !== undefined) {
            draft.settings.startOfDay = command.startOfDay;
          }
          draft.auditRecords[command.operationId] = {
            id: command.operationId,
            kind: "workspace.settings-changed.v1",
            taskId: null,
            effectiveDate: null,
            actorId: command.actorId,
            auditTime,
            data: sortedStringRecord(data),
          };
        });
      }
      case "MaterializeOccurrence": {
        const templateId = requireNonEmpty(command.templateId, "templateId");
        const occurrenceDate = requireDate(
          command.occurrenceDate,
          "occurrence"
        );
        const deviceId = requireNonEmpty(command.deviceId, "deviceId");
        const auditTime = requireAuditTime(command.auditTime);
        const template = state.recurrenceTemplates[templateId];
        if (template === undefined || isDeleted(template.deletionDots)) {
          throw new Error(`Recurrence template not found: ${templateId}`);
        }
        if (
          !enumerateOccurrenceDates(
            template.rule,
            occurrenceDate,
            occurrenceDate
          ).includes(occurrenceDate)
        ) {
          throw new Error("Occurrence date does not match recurrence rule");
        }
        const taskId = await this.occurrenceIds.create(
          templateId,
          occurrenceDate
        );
        const existing = state.materializedOccurrences[taskId];
        if (existing !== undefined) {
          if (
            existing.templateId === templateId &&
            existing.occurrenceDate === occurrenceDate &&
            existing.taskId === taskId
          ) {
            return [];
          }
          throw new Error("Deterministic occurrence ID collision");
        }
        if (state.tasks[taskId] !== undefined) {
          throw new Error("Deterministic occurrence task ID collision");
        }
        const key = positionKey(state, command);
        return document.change(command.type, (draft) => {
          draft.tasks[taskId] = {
            id: taskId,
            title: template.title,
            note: template.note,
            category: template.category,
            position: { key, actorId: command.actorId },
            created: { deviceId, auditTime },
            inboxEnteredOn:
              template.category === "INBOX" ? occurrenceDate : null,
            deferredUntil: null,
            originalCategory: null,
            completion: "active",
            completionEpoch: 0,
            tags: { adds: {}, removedDots: {} },
            deletionDots: {},
          };
          draft.materializedOccurrences[taskId] = {
            templateId,
            occurrenceDate,
            taskId,
          };
        });
      }
      case "ImportOfflineWorkspace": {
        const imported = validateOfflineImport(state, command);
        const auditExists =
          state.auditRecords[command.operationId] !== undefined;
        const exactAudit = hasExactImportAudit(state, command, imported);
        let existingTargetCount = 0;

        for (const importedTask of imported.tasks) {
          const existing = state.tasks[importedTask.targetTaskId];
          if (existing === undefined) continue;
          existingTargetCount += 1;
          if (
            !hasExactImportProvenance(
              existing,
              imported.sourceWorkspaceId,
              importedTask.sourceTaskId,
              state.workspaceId
            )
          ) {
            throw new Error(
              "Imported task ID collides with incompatible target data"
            );
          }
          if (
            !hasExactImportedContent(
              state,
              existing,
              importedTask,
              imported.deviceId,
              imported.auditTime
            )
          ) {
            throw new Error(
              "Imported task ID already contains different imported content"
            );
          }
        }

        if (auditExists && !exactAudit) {
          throw new Error(
            "operationId already identifies another audit record"
          );
        }
        if (exactAudit) {
          if (existingTargetCount === imported.tasks.length) return [];
          throw new Error("Offline import audit has incomplete target data");
        }
        if (existingTargetCount > 0) {
          throw new Error(
            "Imported task already exists without its exact import audit"
          );
        }

        const liveTasks = Object.values(state.tasks)
          .filter((task) => !isDeleted(task.deletionDots))
          .sort(canonicalTaskOrder);
        const lastKey = liveTasks.at(-1)?.position.key ?? null;
        let positionKeys: readonly string[];
        try {
          positionKeys = generateNKeysBetween(
            lastKey,
            null,
            imported.tasks.length
          );
        } catch {
          throw new Error("Invalid imported task positions");
        }

        const dots = await Promise.all(
          imported.tasks.map(async (importedTask) => ({
            tags: await Promise.all(
              importedTask.tags.map(async (tag) => ({
                tag,
                dot: await importDot(
                  command.operationId,
                  importedTask.targetTaskId,
                  "tag",
                  tag
                ),
              }))
            ),
            selectedDates: await Promise.all(
              importedTask.selectedDates.map(async (date) => ({
                date,
                dot: await importDot(
                  command.operationId,
                  importedTask.targetTaskId,
                  "day",
                  date
                ),
              }))
            ),
          }))
        );

        return document.change(command.type, (draft) => {
          imported.tasks.forEach((importedTask, index) => {
            const taskDots = dots[index]!;
            const completionBaselineEpoch =
              importedTask.completion === "completed" ? 1 : 0;
            draft.tasks[importedTask.targetTaskId] = {
              id: importedTask.targetTaskId,
              title: importedTask.title,
              note: importedTask.note,
              category: importedTask.category,
              position: {
                key: positionKeys[index]!,
                actorId: command.actorId,
              },
              created: {
                deviceId: imported.deviceId,
                auditTime: imported.auditTime,
              },
              inboxEnteredOn: importedTask.inboxEnteredOn,
              deferredUntil: importedTask.deferredUntil,
              originalCategory: importedTask.originalCategory,
              completion: importedTask.completion,
              completionBaselineEpoch,
              completionEpoch: completionBaselineEpoch,
              tags: {
                adds: Object.fromEntries(
                  taskDots.tags.map(({ tag, dot }) => [tag, { [dot]: true }])
                ),
                removedDots: {},
              },
              deletionDots: {},
              importedFrom: {
                version: "lift-offline-import-v1",
                sourceWorkspaceId: imported.sourceWorkspaceId,
                sourceTaskId: importedTask.sourceTaskId,
                targetWorkspaceId: state.workspaceId,
              },
            };

            for (const { date, dot } of taskDots.selectedDates) {
              if (draft.dailySelections[date] === undefined) {
                draft.dailySelections[date] = {
                  adds: {},
                  removedDots: {},
                };
              }
              draft.dailySelections[date]!.adds[importedTask.targetTaskId] = {
                [dot]: true,
              };
            }
          });
          draft.auditRecords[command.operationId] = {
            id: command.operationId,
            kind: "offline.workspace-imported.v1",
            taskId: null,
            effectiveDate: null,
            actorId: command.actorId,
            auditTime: imported.auditTime,
            data: {
              sourceWorkspaceId: imported.sourceWorkspaceId,
              importedTaskCount: String(imported.tasks.length),
            },
          };
        });
      }
      case "AppendAuditRecord": {
        const recordId = requireNonEmpty(
          command.auditRecordId ?? command.operationId,
          "auditRecordId"
        );
        const kind = requireNonEmpty(command.auditKind, "auditKind");
        const auditTime = requireAuditTime(command.auditTime);
        const taskId =
          command.taskId === null
            ? null
            : requireNonEmpty(command.taskId, "taskId");
        const effectiveDate =
          command.effectiveDate === null
            ? null
            : requireDate(command.effectiveDate, "effective");
        const data = sortedStringRecord(command.data);
        const existing = state.auditRecords[recordId];
        if (existing !== undefined) {
          if (
            existing.kind === kind &&
            existing.taskId === taskId &&
            existing.effectiveDate === effectiveDate &&
            existing.actorId === command.actorId &&
            existing.auditTime === auditTime &&
            JSON.stringify(existing.data) === JSON.stringify(data)
          ) {
            return [];
          }
          throw new Error("auditRecordId already identifies another record");
        }
        return document.change(command.type, (draft) => {
          draft.auditRecords[recordId] = {
            id: recordId,
            kind,
            taskId,
            effectiveDate,
            actorId: command.actorId,
            auditTime,
            data,
          };
        });
      }
    }

    throw new Error("Invalid workspace command type");
  }
}
