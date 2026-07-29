import type { Dot } from "./WorkspaceState";

export interface ConflictResolution<T> {
  value: T;
  winnerOpId: string;
  alternatives: ReadonlyArray<{ opId: string; value: T }>;
}

export interface TaskPosition {
  key: string;
  actorId: string;
  taskId: string;
}

const requireNonEmptyIdentifier = (kind: string, value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${kind}: expected a non-empty string`);
  }

  return value;
};

const codeUnitCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const CANONICAL_AUTOMERGE_OP_ID = /^(0|[1-9]\d*)@((?:[0-9a-f]{2})+)$/;

const parseOpId = (opIdValue: unknown): { counter: bigint; actor: string } => {
  if (typeof opIdValue !== "string") {
    throw new Error(`Invalid Automerge op id: ${String(opIdValue)}`);
  }

  const match = CANONICAL_AUTOMERGE_OP_ID.exec(opIdValue);
  if (match === null) {
    throw new Error(`Invalid Automerge op id: ${opIdValue}`);
  }

  const [, counter, actor] = match;
  return { counter: BigInt(counter), actor };
};

export const compareOpIds = (left: string, right: string): number => {
  const a = parseOpId(left);
  const b = parseOpId(right);
  const actorOrder = codeUnitCompare(a.actor, b.actor);

  return actorOrder !== 0
    ? actorOrder
    : a.counter < b.counter
      ? -1
      : a.counter > b.counter
        ? 1
        : 0;
};

export function resolveScalar<T>(
  values: Readonly<Record<string, T>>
): ConflictResolution<T> {
  const alternatives = Object.entries(values)
    .map(([opId, value]) => {
      parseOpId(opId);
      return { opId, value };
    })
    .sort((left, right) => compareOpIds(left.opId, right.opId));

  if (alternatives.length === 0) {
    throw new Error("Scalar conflict set is empty");
  }

  const winner = alternatives[alternatives.length - 1];
  return {
    value: winner.value,
    winnerOpId: winner.opId,
    alternatives,
  };
}

export const resolveCompletion = (
  values: Readonly<Record<string, "active" | "completed">>
): "active" | "completed" => {
  const alternatives = Object.entries(values)
    .map(([opId, value]) => {
      parseOpId(opId);
      return [opId, value] as const;
    })
    .sort(([left], [right]) => compareOpIds(left, right));

  if (alternatives.length === 0) {
    throw new Error("Completion conflict set is empty");
  }

  if (alternatives.length === 1) {
    return alternatives[0][1];
  }

  return alternatives.some(([, value]) => value === "completed")
    ? "completed"
    : "active";
};

export const isDeleted = (
  deletionDots: Readonly<Record<Dot, true>>
): boolean => {
  const dots = Object.keys(deletionDots);
  for (const dot of dots) {
    requireNonEmptyIdentifier("dot identifier", dot);
  }

  return dots.length > 0;
};

export const comparePositions = (
  left: TaskPosition,
  right: TaskPosition
): number => {
  const leftKey = requireNonEmptyIdentifier("position key", left.key);
  const rightKey = requireNonEmptyIdentifier("position key", right.key);
  const leftActor = requireNonEmptyIdentifier("actorId", left.actorId);
  const rightActor = requireNonEmptyIdentifier("actorId", right.actorId);
  const leftTask = requireNonEmptyIdentifier("taskId", left.taskId);
  const rightTask = requireNonEmptyIdentifier("taskId", right.taskId);

  const keyOrder = codeUnitCompare(leftKey, rightKey);
  if (keyOrder !== 0) return keyOrder;

  const actorOrder = codeUnitCompare(leftActor, rightActor);
  return actorOrder !== 0 ? actorOrder : codeUnitCompare(leftTask, rightTask);
};
