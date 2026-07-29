import fc from "fast-check";

import { add, emptySet, mergeSet, removeObserved } from "../ObservedRemoveSet";
import { resolveScalar } from "../ConflictPolicy";

const PROPERTY_SEED = 20_260_722;
const PROPERTY_RUNS = 100;

interface OrSetOperation {
  element: string;
  counter: number;
  actor: string;
  removeObserved: boolean;
}

const selectUniqueOrSetOperation = ({
  counter,
  actor,
}: OrSetOperation): string => `${counter}@${actor}`;

const byPriorities = <T>(values: readonly T[], priorities: readonly number[]) =>
  values
    .map((value, index) => ({ value, priority: priorities[index] ?? 0, index }))
    .sort((left, right) =>
      left.priority !== right.priority
        ? left.priority - right.priority
        : left.index - right.index
    )
    .map(({ value }) => value);

describe("deterministic conflict properties", () => {
  it("uses global dot identity for OR-set generator uniqueness", () => {
    const first = {
      element: "task-a",
      counter: 1,
      actor: "aa",
      removeObserved: false,
    };
    const sameDotOnAnotherElement = { ...first, element: "task-b" };

    expect(selectUniqueOrSetOperation(first)).toBe(
      selectUniqueOrSetOperation(sameDotOnAnotherElement)
    );
  });

  it("serializes scalar conflicts identically for shuffled map insertion orders", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            counter: fc.integer({ min: 0, max: 1_000_000 }),
            actor: fc.stringMatching(/^(?:[0-9a-f]{2}){1,4}$/),
            value: fc.constantFrom("INBOX", "SIMPLE", "FOCUS"),
          }),
          {
            minLength: 1,
            maxLength: 20,
            selector: ({ counter, actor }) => `${counter}@${actor}`,
          }
        ),
        fc.array(fc.integer(), { minLength: 20, maxLength: 20 }),
        (entries, priorities) => {
          const canonical = JSON.stringify(
            resolveScalar(
              Object.fromEntries(
                entries.map(({ counter, actor, value }) => [
                  `${counter}@${actor}`,
                  value,
                ])
              )
            )
          );
          const shuffled = byPriorities(entries, priorities);
          const arrived = JSON.stringify(
            resolveScalar(
              Object.fromEntries(
                shuffled.map(({ counter, actor, value }) => [
                  `${counter}@${actor}`,
                  value,
                ])
              )
            )
          );

          expect(arrived).toBe(canonical);
        }
      ),
      { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS }
    );
  });

  it("serializes the same OR-set state identically for shuffled and duplicated merges", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            element: fc.stringMatching(/^task-[a-z]{1,5}$/),
            counter: fc.integer({ min: 0, max: 1_000_000 }),
            actor: fc.stringMatching(/^(?:[0-9a-f]{2}){1,3}$/),
            removeObserved: fc.boolean(),
          }),
          {
            minLength: 1,
            maxLength: 20,
            selector: selectUniqueOrSetOperation,
          }
        ),
        fc.array(fc.integer(), { minLength: 40, maxLength: 40 }),
        (operations, priorities) => {
          const replicas = operations.map(
            ({ element, counter, actor, removeObserved: shouldRemove }) => {
              const added = add(emptySet(), element, `${counter}@${actor}`);
              return shouldRemove ? removeObserved(added, element) : added;
            }
          );
          const canonical = replicas.reduce(mergeSet, emptySet());
          const shuffledWithDuplicates = byPriorities(
            [...replicas, ...replicas],
            priorities
          );
          const arrived = shuffledWithDuplicates.reduce(mergeSet, emptySet());

          expect(JSON.stringify(arrived)).toBe(JSON.stringify(canonical));
        }
      ),
      { seed: PROPERTY_SEED + 1, numRuns: PROPERTY_RUNS }
    );
  });

  it("obeys OR-set merge commutativity, associativity, and idempotence", () => {
    const stateArbitrary = fc
      .uniqueArray(
        fc.record({
          element: fc.stringMatching(/^task-[a-z]{1,4}$/),
          counter: fc.integer({ min: 0, max: 1_000 }),
          actor: fc.stringMatching(/^(?:[0-9a-f]{2}){1,3}$/),
          removeObserved: fc.boolean(),
        }),
        {
          maxLength: 12,
          selector: selectUniqueOrSetOperation,
        }
      )
      .map((operations) =>
        operations.reduce((state, operation) => {
          const added = add(
            state,
            operation.element,
            `${operation.counter}@${operation.actor}`
          );
          return operation.removeObserved
            ? removeObserved(added, operation.element)
            : added;
        }, emptySet())
      );

    fc.assert(
      fc.property(
        stateArbitrary,
        stateArbitrary,
        stateArbitrary,
        (left, middle, right) => {
          expect(JSON.stringify(mergeSet(left, right))).toBe(
            JSON.stringify(mergeSet(right, left))
          );
          expect(JSON.stringify(mergeSet(mergeSet(left, middle), right))).toBe(
            JSON.stringify(mergeSet(left, mergeSet(middle, right)))
          );
          expect(JSON.stringify(mergeSet(left, left))).toBe(
            JSON.stringify(left)
          );
        }
      ),
      { seed: PROPERTY_SEED + 2, numRuns: PROPERTY_RUNS }
    );
  });
});
