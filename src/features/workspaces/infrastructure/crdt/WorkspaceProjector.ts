import * as Automerge from "@automerge/automerge";

import { comparePositions, isDeleted } from "../../domain/ConflictPolicy";
import { compareCompletionCandidates } from "../../domain/CompletionLifecycle";
import { isValidDateOnly } from "../../domain/EffectiveDate";
import { projectDeferred } from "../../domain/Recurrence";
import type {
  AuditRecordState,
  CompletionRecordState,
  TaskCrdtState,
  WorkspaceState,
} from "../../domain/WorkspaceState";
import type {
  AuditProjectionRecord,
  ConflictProjectionRecord,
  DailySelectionProjectionRecord,
  DailyStatisticsProjectionRecord,
  TaskProjectionRecord,
} from "../database/records";
import { AutomergeConflictReader } from "./AutomergeConflictReader";
import type { AutomergeWorkspaceDocument } from "./AutomergeWorkspaceDocument";

type PlainScalar = string | number | boolean | null;
type ScalarGuard<T extends PlainScalar> = (
  value: Automerge.AutomergeValue
) => value is T;

export interface WorkspaceProjection {
  readonly tasks: readonly TaskProjectionRecord[];
  readonly dailySelections: readonly DailySelectionProjectionRecord[];
  readonly conflicts: readonly ConflictProjectionRecord[];
  readonly audit: readonly AuditProjectionRecord[];
  readonly dailyStatistics: readonly DailyStatisticsProjectionRecord[];
}

export interface WorkspaceProjectionBuilder {
  project(
    document: AutomergeWorkspaceDocument,
    effectiveDate: string,
    projectedAt: number
  ): WorkspaceProjection;
}

const stringGuard = (value: Automerge.AutomergeValue): value is string =>
  typeof value === "string";
const nullableStringGuard = (
  value: Automerge.AutomergeValue
): value is string | null => value === null || typeof value === "string";
const categoryGuard = (
  value: Automerge.AutomergeValue
): value is TaskCrdtState["category"] =>
  value === "INBOX" || value === "SIMPLE" || value === "FOCUS";
const nullableCategoryGuard = (
  value: Automerge.AutomergeValue
): value is TaskCrdtState["originalCategory"] =>
  value === null || categoryGuard(value);

const scalarText = (value: PlainScalar): string =>
  value === null ? "null" : String(value);

const selectedElements = (
  set: Readonly<{
    adds: Readonly<Record<string, Readonly<Record<string, true>>>>;
    removedDots: Readonly<Record<string, true>>;
  }>
): string[] =>
  Object.entries(set.adds)
    .filter(([, dots]) =>
      Object.keys(dots).some((dot) => !Object.hasOwn(set.removedDots, dot))
    )
    .map(([element]) => element)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

const cloneTask = (task: TaskProjectionRecord): TaskProjectionRecord => ({
  ...task,
  tags: [...task.tags],
});

const cloneConflict = (
  conflict: ConflictProjectionRecord
): ConflictProjectionRecord => ({
  ...conflict,
  alternativeValues: [...conflict.alternativeValues],
});

const cloneAudit = (record: AuditProjectionRecord): AuditProjectionRecord => ({
  ...record,
  data: { ...record.data },
});

const sortedData = (
  data: Readonly<Record<string, string>>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(data).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  );

const compareReviewCandidates = (
  left: Readonly<AuditRecordState>,
  right: Readonly<AuditRecordState>
): number => {
  const leftDate = left.effectiveDate ?? "";
  const rightDate = right.effectiveDate ?? "";
  if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
  if (left.actorId !== right.actorId) {
    return left.actorId < right.actorId ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};

/** Builds replaceable, deterministic read models from one validated document. */
export class WorkspaceProjector implements WorkspaceProjectionBuilder {
  private readonly conflicts = new AutomergeConflictReader();

  project(
    document: AutomergeWorkspaceDocument,
    effectiveDate: string,
    projectedAt: number
  ): WorkspaceProjection {
    if (!isValidDateOnly(effectiveDate)) {
      throw new Error("Invalid projection effective date");
    }
    if (!Number.isSafeInteger(projectedAt) || projectedAt < 0) {
      throw new Error("Invalid projection metadata time");
    }

    const state = document.value();
    const raw = Automerge.load<WorkspaceState>(document.save().slice());
    const taskRecords: TaskProjectionRecord[] = [];
    const conflictRecords: ConflictProjectionRecord[] = [];
    const visibleTaskIds = new Set<string>();

    for (const taskId of Object.keys(state.tasks).sort()) {
      const canonicalTask = state.tasks[taskId];
      const rawTask = raw.tasks[taskId];
      if (
        canonicalTask === undefined ||
        rawTask === undefined ||
        isDeleted(canonicalTask.deletionDots)
      ) {
        continue;
      }

      visibleTaskIds.add(taskId);
      const category = this.scalar(
        rawTask,
        "category",
        canonicalTask.category,
        categoryGuard,
        state.workspaceId,
        taskId,
        "category",
        projectedAt,
        conflictRecords
      );
      const deferredUntil = this.scalar(
        rawTask,
        "deferredUntil",
        canonicalTask.deferredUntil,
        nullableStringGuard,
        state.workspaceId,
        taskId,
        "deferredUntil",
        projectedAt,
        conflictRecords
      );
      const originalCategory = this.scalar(
        rawTask,
        "originalCategory",
        canonicalTask.originalCategory,
        nullableCategoryGuard,
        state.workspaceId,
        taskId,
        "originalCategory",
        projectedAt,
        conflictRecords
      );
      const positionKey = this.scalar(
        rawTask.position,
        "key",
        canonicalTask.position.key,
        stringGuard,
        state.workspaceId,
        taskId,
        "position.key",
        projectedAt,
        conflictRecords
      );
      const positionActor = this.scalar(
        rawTask.position,
        "actorId",
        canonicalTask.position.actorId,
        stringGuard,
        state.workspaceId,
        taskId,
        "position.actorId",
        projectedAt,
        conflictRecords
      );
      const projectedCategory = projectDeferred(
        { category, deferredUntil, originalCategory },
        effectiveDate
      );
      if (projectedCategory === null) {
        throw new Error(`Unable to project category for task ${taskId}`);
      }

      taskRecords.push({
        workspaceId: state.workspaceId,
        taskId,
        title: canonicalTask.title,
        note: canonicalTask.note,
        tags: selectedElements(canonicalTask.tags),
        category: projectedCategory,
        completion: canonicalTask.completion,
        positionKey,
        deferredUntil,
        inboxEnteredOn: canonicalTask.inboxEnteredOn,
        deleted: false,
        updatedAt: projectedAt,
      });

      void positionActor;
    }

    taskRecords.sort((left, right) =>
      comparePositions(
        {
          key: left.positionKey,
          actorId: this.positionActor(raw, left.taskId),
          taskId: left.taskId,
        },
        {
          key: right.positionKey,
          actorId: this.positionActor(raw, right.taskId),
          taskId: right.taskId,
        }
      )
    );

    const dailyRecords: DailySelectionProjectionRecord[] = [];
    for (const date of Object.keys(state.dailySelections).sort()) {
      const selection = state.dailySelections[date];
      if (selection === undefined) {
        continue;
      }
      for (const taskId of selectedElements(selection)) {
        if (visibleTaskIds.has(taskId)) {
          dailyRecords.push({
            workspaceId: state.workspaceId,
            date,
            taskId,
            selected: true,
            updatedAt: projectedAt,
          });
        }
      }
    }

    conflictRecords.sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    );

    const auditRecords: AuditProjectionRecord[] = Object.values(
      state.auditRecords
    )
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      )
      .map((record) => ({
        workspaceId: state.workspaceId,
        source: "audit" as const,
        recordId: record.id,
        taskId: record.taskId,
        effectiveDate: record.effectiveDate,
        kind: record.kind,
        actorId: record.actorId,
        auditTime: record.auditTime,
        data: sortedData(record.data),
      }));

    const lifecycleGroups = new Map<string, CompletionRecordState[]>();
    for (const record of Object.values(state.completionRecords)) {
      const key = `${record.taskId}\0${record.completionEpoch}\0${record.kind}`;
      const group = lifecycleGroups.get(key) ?? [];
      group.push(record);
      lifecycleGroups.set(key, group);
    }
    const canonicalLifecycle = [...lifecycleGroups.values()]
      .map((group) => [...group].sort(compareCompletionCandidates)[0])
      .filter((record): record is CompletionRecordState => record !== undefined)
      .sort((left, right) =>
        left.taskId !== right.taskId
          ? left.taskId < right.taskId
            ? -1
            : 1
          : left.completionEpoch - right.completionEpoch
      );
    for (const record of canonicalLifecycle) {
      auditRecords.push({
        workspaceId: state.workspaceId,
        source: "completion",
        recordId: `${record.taskId}:${record.completionEpoch}:${record.kind}`,
        taskId: record.taskId,
        effectiveDate: record.effectiveDate,
        kind: `task.${record.kind}.v1`,
        actorId: record.actorId,
        auditTime: record.auditTime,
        data: sortedData({
          categoryAtCompletion: record.categoryAtCompletion ?? "",
          completionEpoch: String(record.completionEpoch),
          fromCompletionEpoch: String(record.fromCompletionEpoch),
        }),
      });
    }
    auditRecords.sort((left, right) =>
      left.source !== right.source
        ? left.source < right.source
          ? -1
          : 1
        : left.recordId < right.recordId
          ? -1
          : left.recordId > right.recordId
            ? 1
            : 0
    );

    const statistics = new Map<string, DailyStatisticsProjectionRecord>();
    const rowFor = (date: string): DailyStatisticsProjectionRecord => {
      const existing = statistics.get(date);
      if (existing !== undefined) return existing;
      const row: DailyStatisticsProjectionRecord = {
        workspaceId: state.workspaceId,
        date,
        simpleCompleted: 0,
        focusCompleted: 0,
        inboxReviewed: 0,
      };
      statistics.set(date, row);
      return row;
    };
    for (const record of canonicalLifecycle) {
      if (record.kind !== "completed") continue;
      const row = rowFor(record.effectiveDate);
      if (record.categoryAtCompletion === "SIMPLE") row.simpleCompleted += 1;
      if (record.categoryAtCompletion === "FOCUS") row.focusCompleted += 1;
    }
    const reviewsByTask = new Map<string, AuditRecordState[]>();
    for (const record of Object.values(state.auditRecords)) {
      if (
        record.kind !== "task.category-changed.v1" ||
        record.taskId === null ||
        record.effectiveDate === null ||
        record.data.firstInboxReview !== "true"
      ) {
        continue;
      }
      const candidates = reviewsByTask.get(record.taskId) ?? [];
      candidates.push(record);
      reviewsByTask.set(record.taskId, candidates);
    }
    for (const candidates of reviewsByTask.values()) {
      const review = [...candidates].sort(compareReviewCandidates)[0];
      if (
        review?.effectiveDate !== null &&
        review?.effectiveDate !== undefined
      ) {
        rowFor(review.effectiveDate).inboxReviewed += 1;
      }
    }

    return {
      tasks: taskRecords.map(cloneTask),
      dailySelections: dailyRecords.map((record) => ({ ...record })),
      conflicts: conflictRecords.map(cloneConflict),
      audit: auditRecords.map(cloneAudit),
      dailyStatistics: [...statistics.values()]
        .sort((left, right) =>
          left.date < right.date ? -1 : left.date > right.date ? 1 : 0
        )
        .map((record) => ({ ...record })),
    };
  }

  private scalar<T extends PlainScalar>(
    object: object,
    property: string | number,
    fallback: T,
    guard: ScalarGuard<T>,
    workspaceId: string,
    taskId: string,
    path: string,
    projectedAt: number,
    records: ConflictProjectionRecord[]
  ): T {
    const resolution = this.conflicts.readScalar(object, property, guard);
    if (resolution === undefined) {
      return fallback;
    }
    const alternatives = resolution.alternatives.filter(
      ({ opId }) => opId !== resolution.winnerOpId
    );
    if (alternatives.length > 0) {
      records.push({
        id: this.conflictId(workspaceId, taskId, path),
        workspaceId,
        taskId,
        path,
        winningValue: scalarText(resolution.value),
        alternativeValues: alternatives.map(({ value }) => scalarText(value)),
        state: "unresolved",
        detectedAt: projectedAt,
        resolvedAt: null,
      });
    }
    return resolution.value;
  }

  private conflictId(
    workspaceId: string,
    taskId: string,
    path: string
  ): string {
    return `${workspaceId}\0${taskId}\0${path}`;
  }

  private positionActor(
    document: Automerge.Doc<WorkspaceState>,
    taskId: string
  ): string {
    const task = document.tasks[taskId];
    if (task === undefined) {
      throw new Error(`Missing projected task ${taskId}`);
    }
    return (
      this.conflicts.readScalar(task.position, "actorId", stringGuard)?.value ??
      task.position.actorId
    );
  }
}
