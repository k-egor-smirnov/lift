import type {
  WorkspaceReadModel,
  WorkspaceRepository,
  WorkspaceTaskQuery,
  WorkspaceTaskReadModel,
} from "../../application/ports/WorkspaceRepository";
import { comparePositions } from "../../domain/ConflictPolicy";
import { isValidDateOnly } from "../../domain/EffectiveDate";
import { projectDeferred } from "../../domain/Recurrence";
import { createEmptyWorkspace } from "../../domain/WorkspaceState";
import {
  AutomergeWorkspaceDocument,
  type BinaryWorkspaceChange,
} from "../crdt/AutomergeWorkspaceDocument";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";
import type { TaskProjectionRecord } from "./records";

const READ_MODEL_ACTOR_ID = "ff".repeat(16);

const requireNonEmpty = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return value;
};

const cloneTask = (record: TaskProjectionRecord): WorkspaceTaskReadModel => ({
  workspaceId: record.workspaceId,
  taskId: record.taskId,
  title: record.title,
  note: record.note,
  tags: [...record.tags],
  category: record.category,
  completion: record.completion,
  positionKey: record.positionKey,
  deferredUntil: record.deferredUntil,
  inboxEnteredOn: record.inboxEnteredOn,
});

/** Reads disposable projections and reconstructs authoritative CRDT state. */
export class DexieWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly database: LiftSecureDatabase) {}

  async loadDocument(
    workspaceIdValue: string,
    actorIdValue: string,
    createIfMissing = false
  ): Promise<AutomergeWorkspaceDocument | undefined> {
    const workspaceId = requireNonEmpty(workspaceIdValue, "workspaceId");
    const actorId = requireNonEmpty(actorIdValue, "actorId");
    const snapshot = await this.database.workspaceSnapshots.get(workspaceId);
    const records = await this.database.workspaceChanges
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();

    if (snapshot === undefined && !createIfMissing) {
      return undefined;
    }
    let document: AutomergeWorkspaceDocument;
    if (snapshot === undefined) {
      document = AutomergeWorkspaceDocument.create(
        createEmptyWorkspace(workspaceId, "UTC", "00:00"),
        actorId
      );
    } else {
      document = AutomergeWorkspaceDocument.load(
        new Uint8Array([...snapshot.bytes]),
        actorId
      );
    }
    const changes: BinaryWorkspaceChange[] = records
      .sort((left, right) =>
        left.changeHash < right.changeHash
          ? -1
          : left.changeHash > right.changeHash
            ? 1
            : 0
      )
      .map((record) => ({
        bytes: new Uint8Array([...record.bytes]),
        hash: record.changeHash,
        dependencies: [...record.dependencies],
      }));
    document.apply(changes);
    if (document.value().workspaceId !== workspaceId) {
      throw new Error("Stored workspace document has a mismatched workspaceId");
    }
    return document;
  }

  async getWorkspace(
    workspaceId: string,
    actorId: string
  ): Promise<WorkspaceReadModel | undefined> {
    const document = await this.loadDocument(workspaceId, actorId);
    if (document === undefined) {
      return undefined;
    }
    return {
      state: structuredClone(document.value()),
      heads: [...document.heads()],
    };
  }

  async findTask(
    workspaceIdValue: string,
    taskIdValue: string,
    effectiveDateValue: string
  ): Promise<WorkspaceTaskReadModel | undefined> {
    const workspaceId = requireNonEmpty(workspaceIdValue, "workspaceId");
    const taskId = requireNonEmpty(taskIdValue, "taskId");
    if (!isValidDateOnly(effectiveDateValue)) {
      throw new Error("Invalid query effective date");
    }
    const record = await this.database.taskProjections.get([
      workspaceId,
      taskId,
    ]);
    if (record === undefined) {
      return undefined;
    }
    const document = await this.loadDocument(workspaceId, READ_MODEL_ACTOR_ID);
    const canonical = document?.value().tasks[taskId];
    if (canonical === undefined) {
      return undefined;
    }
    const category = projectDeferred(canonical, effectiveDateValue);
    if (category === null) {
      throw new Error(`Unable to project category for task ${taskId}`);
    }
    return { ...cloneTask(record), category };
  }

  async findTasks(
    query: WorkspaceTaskQuery
  ): Promise<readonly WorkspaceTaskReadModel[]> {
    const workspaceId = requireNonEmpty(query.workspaceId, "workspaceId");
    if (!isValidDateOnly(query.effectiveDate)) {
      throw new Error("Invalid query effective date");
    }
    const records = await this.database.taskProjections
      .where("workspaceId")
      .equals(workspaceId)
      .toArray();
    const document = await this.loadDocument(workspaceId, READ_MODEL_ACTOR_ID);
    const state = document?.value();

    const tasks = records
      .map((record) => {
        const canonical = state?.tasks[record.taskId];
        if (canonical === undefined) {
          return cloneTask(record);
        }
        const category = projectDeferred(canonical, query.effectiveDate);
        if (category === null) {
          throw new Error(
            `Unable to project category for task ${record.taskId}`
          );
        }
        return { ...cloneTask(record), category };
      })
      .filter(
        (task) =>
          (query.projectedCategory === undefined ||
            task.category === query.projectedCategory) &&
          (query.completion === undefined ||
            task.completion === query.completion)
      );

    tasks.sort((left, right) => {
      const leftActor = state?.tasks[left.taskId]?.position.actorId ?? "0";
      const rightActor = state?.tasks[right.taskId]?.position.actorId ?? "0";
      return comparePositions(
        {
          key: left.positionKey,
          actorId: leftActor,
          taskId: left.taskId,
        },
        {
          key: right.positionKey,
          actorId: rightActor,
          taskId: right.taskId,
        }
      );
    });
    return tasks.map((task) => ({ ...task, tags: [...task.tags] }));
  }

  async getTaskIdsForDay(
    workspaceIdValue: string,
    dateValue: string
  ): Promise<readonly string[]> {
    const workspaceId = requireNonEmpty(workspaceIdValue, "workspaceId");
    if (!isValidDateOnly(dateValue)) {
      throw new Error("Invalid selection date");
    }
    const records = await this.database.dailySelectionProjections
      .where("[workspaceId+date]")
      .equals([workspaceId, dateValue])
      .toArray();
    return records
      .filter(({ selected }) => selected)
      .map(({ taskId }) => taskId)
      .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  }
}
