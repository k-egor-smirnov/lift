import * as Automerge from "@automerge/automerge";

import {
  resolveCompletion,
  resolveScalar,
  type ConflictResolution,
} from "../../domain/ConflictPolicy";

type PlainScalar = string | number | boolean | null;
type ScalarGuard<T extends PlainScalar> = (
  value: Automerge.AutomergeValue
) => value is T;

export interface CompletionConflictResolution {
  readonly value: "active" | "completed";
  readonly alternatives: ReadonlyArray<{
    readonly opId: string;
    readonly value: "active" | "completed";
  }>;
}

const completionGuard = (
  value: Automerge.AutomergeValue
): value is "active" | "completed" =>
  value === "active" || value === "completed";

/** Reads only true Automerge conflicts and delegates winners to Domain policy. */
export class AutomergeConflictReader {
  readScalar<T extends PlainScalar>(
    object: object,
    property: string | number,
    guard: ScalarGuard<T>
  ): ConflictResolution<T> | undefined {
    const conflicts = Automerge.getConflicts(object, property);
    if (conflicts === undefined) {
      return undefined;
    }

    const alternatives: Record<string, T> = {};
    for (const [opId, value] of Object.entries(conflicts)) {
      if (!guard(value)) {
        throw new Error(
          `Invalid scalar conflict value at ${String(property)} for ${opId}`
        );
      }
      alternatives[opId] = value;
    }

    return resolveScalar(alternatives);
  }

  readCompletion(
    object: object,
    property: string | number
  ): CompletionConflictResolution | undefined {
    const conflicts = Automerge.getConflicts(object, property);
    if (conflicts === undefined) {
      return undefined;
    }

    const alternatives: Record<string, "active" | "completed"> = {};
    for (const [opId, value] of Object.entries(conflicts)) {
      if (!completionGuard(value)) {
        throw new Error(`Invalid completion conflict value for ${opId}`);
      }
      alternatives[opId] = value;
    }

    return {
      value: resolveCompletion(alternatives),
      alternatives: Object.entries(alternatives)
        .map(([opId, value]) => ({ opId, value }))
        .sort((left, right) =>
          left.opId < right.opId ? -1 : left.opId > right.opId ? 1 : 0
        ),
    };
  }
}
