import fc from "fast-check";

import { add, emptySet, mergeSet, removeObserved } from "../ObservedRemoveSet";
import { resolveScalar } from "../ConflictPolicy";

const PROPERTY_SEED = 20_260_722;
const PROPERTY_RUNS = 100;

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
  it("serializes scalar conflicts identically for shuffled map insertion orders", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            counter: fc.integer({ min: 0, max: 1_000_000 }),
            actor: fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,7}$/),
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
            actor: fc.stringMatching(/^[a-z]{1,5}$/),
            removeObserved: fc.boolean(),
          }),
          {
            minLength: 1,
            maxLength: 20,
            selector: ({ element, counter, actor }) =>
              `${element}:${counter}@${actor}`,
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
          actor: fc.stringMatching(/^[a-z]{1,4}$/),
          removeObserved: fc.boolean(),
        }),
        {
          maxLength: 12,
          selector: ({ element, counter, actor }) =>
            `${element}:${counter}@${actor}`,
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
