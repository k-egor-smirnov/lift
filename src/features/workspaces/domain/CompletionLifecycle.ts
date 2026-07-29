import type { CompletionRecordState, TaskCrdtState } from "./WorkspaceState";

export interface CanonicalCompletionLifecycle {
  readonly completion: TaskCrdtState["completion"];
  readonly completionEpoch: number;
}

export const completionForEpoch = (
  completionEpoch: number
): TaskCrdtState["completion"] =>
  completionEpoch % 2 === 0 ? "active" : "completed";

export const completionKindForEpoch = (
  completionEpoch: number
): CompletionRecordState["kind"] =>
  completionEpoch % 2 === 0 ? "reopened" : "completed";

export const assertCompletionRecordStructure = (
  record: Readonly<CompletionRecordState>
): void => {
  if (
    !Number.isSafeInteger(record.fromCompletionEpoch) ||
    record.fromCompletionEpoch < 0 ||
    !Number.isSafeInteger(record.completionEpoch) ||
    record.completionEpoch <= 0 ||
    record.completionEpoch !== record.fromCompletionEpoch + 1
  ) {
    throw new Error("Invalid completion lifecycle epoch");
  }
  if (record.kind !== completionKindForEpoch(record.completionEpoch)) {
    throw new Error("Invalid completion lifecycle kind");
  }
  if (
    (record.kind === "completed" && record.categoryAtCompletion === null) ||
    (record.kind === "reopened" && record.categoryAtCompletion !== null)
  ) {
    throw new Error("Invalid completion lifecycle category");
  }
};

export const canonicalCompletionLifecycle = (
  taskId: string,
  records: Readonly<Record<string, CompletionRecordState>>,
  baselineEpoch: 0 | 1 = 0
): CanonicalCompletionLifecycle => {
  const epochs = new Set<number>();
  for (const record of Object.values(records)) {
    if (record.taskId !== taskId) continue;
    assertCompletionRecordStructure(record);
    if (record.completionEpoch <= baselineEpoch) {
      throw new Error("Invalid completion lifecycle before baseline");
    }
    epochs.add(record.completionEpoch);
  }

  let completionEpoch = baselineEpoch;
  while (epochs.has(completionEpoch + 1)) completionEpoch += 1;
  if ([...epochs].some((epoch) => epoch > completionEpoch)) {
    throw new Error("Invalid completion lifecycle gap");
  }

  return {
    completion: completionForEpoch(completionEpoch),
    completionEpoch,
  };
};

export const compareCompletionCandidates = (
  left: Readonly<CompletionRecordState>,
  right: Readonly<CompletionRecordState>
): number => {
  if (left.effectiveDate !== right.effectiveDate) {
    return left.effectiveDate < right.effectiveDate ? -1 : 1;
  }
  if (left.actorId !== right.actorId) {
    return left.actorId < right.actorId ? -1 : 1;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
};
