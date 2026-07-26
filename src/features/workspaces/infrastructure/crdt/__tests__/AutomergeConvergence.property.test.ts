import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { WorkspaceState } from "../../../domain/WorkspaceState";
import {
  AutomergeWorkspaceDocument,
  type BinaryWorkspaceChange,
} from "../AutomergeWorkspaceDocument";

const PROPERTY_SEED = 0x5eed2026;
const PROPERTY_RUNS = 120;
const BASE_NOTE = "shared";

const actorFor = (index: number): string =>
  ((index + 1) % 256).toString(16).padStart(2, "0").repeat(16);

const state = (): WorkspaceState => ({
  schemaVersion: 1,
  workspaceId: "property-workspace",
  settings: { timezone: "UTC", startOfDay: "00:00" },
  tasks: {
    task: {
      id: "task",
      title: "shared",
      note: BASE_NOTE,
      category: "INBOX",
      position: { key: "a0", actorId: actorFor(200) },
      created: { deviceId: "seed", auditTime: "2026-07-22T00:00:00Z" },
      inboxEnteredOn: "2026-07-22",
      deferredUntil: null,
      originalCategory: null,
      completion: "active",
      completionEpoch: 0,
      tags: { adds: {}, removedDots: {} },
      deletionDots: {},
    },
  },
  dailySelections: {},
  recurrenceTemplates: {},
  materializedOccurrences: {},
  completionRecords: {},
  auditRecords: {},
});

type Operation = {
  readonly token: string;
  readonly category: "INBOX" | "SIMPLE" | "FOCUS";
  readonly completion: "active" | "completed";
};

const operationArbitrary = fc.record({
  token: fc
    .array(fc.constantFrom("a", "b", "c", "x", "y", "z"), {
      minLength: 1,
      maxLength: 4,
    })
    .map((characters) => characters.join("")),
  category: fc.constantFrom("INBOX", "SIMPLE", "FOCUS"),
  completion: fc.constantFrom("active", "completed"),
});

const mix = (salt: number, index: number): number => {
  let value = (salt ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
};

const duplicatedShuffle = (
  changes: readonly BinaryWorkspaceChange[],
  salt: number
): BinaryWorkspaceChange[] =>
  [...changes, ...changes]
    .map((change, index) => ({ change, index, rank: mix(salt, index) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ change }) => change);

const canonicalBytes = (document: AutomergeWorkspaceDocument): Uint8Array =>
  new TextEncoder().encode(JSON.stringify(document.canonical()));

describe("Automerge workspace convergence", () => {
  it(
    "converges 2-5 actors across shuffled duplicate delivery and save/reload",
    // This is a fixed, CPU-bound 120-run property check. It normally takes
    // about 3 seconds in isolation, but can exceed 15 seconds when Vitest runs
    // the full 55-file suite across all workers. The timeout is a scheduling
    // budget, not a reduction in seeds/runs or an asynchronous wait.
    { timeout: 30_000 },
    () => {
      fc.assert(
        fc.property(
          fc.array(operationArbitrary, { minLength: 2, maxLength: 5 }),
          fc.nat(),
          fc.nat(),
          (operations: Operation[], leftSalt, rightSalt) => {
            const base = AutomergeWorkspaceDocument.create(
              state(),
              actorFor(0)
            );
            const snapshot = base.save();
            const changes = operations.flatMap((operation, index) => {
              const replica = AutomergeWorkspaceDocument.load(
                snapshot,
                actorFor(index + 1)
              );
              const nextText =
                index % 2 === 0
                  ? `${operation.token}-${BASE_NOTE}`
                  : `${BASE_NOTE}-${operation.token}`;
              const textChanges = replica.updateText(
                ["tasks", "task", "note"],
                nextText
              );
              const scalarChanges = replica.change(
                "property scalar edit",
                (draft) => {
                  draft.tasks.task.category = operation.category;
                  draft.tasks.task.completion = operation.completion;
                }
              );
              return [...textChanges, ...scalarChanges];
            });

            const left = AutomergeWorkspaceDocument.load(
              snapshot,
              actorFor(100)
            );
            const right = AutomergeWorkspaceDocument.load(
              snapshot,
              actorFor(101)
            );
            left.apply(duplicatedShuffle(changes, leftSalt));
            right.apply(duplicatedShuffle(changes, rightSalt));

            expect([...left.heads()].sort()).toEqual([...right.heads()].sort());
            expect(canonicalBytes(left)).toEqual(canonicalBytes(right));

            const reloadedLeft = AutomergeWorkspaceDocument.load(
              left.save(),
              actorFor(102)
            );
            const reloadedRight = AutomergeWorkspaceDocument.load(
              right.save(),
              actorFor(103)
            );
            expect([...reloadedLeft.heads()].sort()).toEqual(
              [...reloadedRight.heads()].sort()
            );
            expect(canonicalBytes(reloadedLeft)).toEqual(
              canonicalBytes(reloadedRight)
            );
          }
        ),
        { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED }
      );
    }
  );
});
