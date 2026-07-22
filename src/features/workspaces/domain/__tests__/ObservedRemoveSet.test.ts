import {
  add,
  emptySet,
  has,
  mergeSet,
  removeObserved,
} from "../ObservedRemoveSet";

describe("ObservedRemoveSet", () => {
  it("keeps a concurrent add that remove did not observe", () => {
    const left = add(emptySet(), "task-1", "1@aa");
    const right = add(emptySet(), "task-1", "1@bb");
    const removedLeft = removeObserved(left, "task-1");

    expect(has(mergeSet(removedLeft, right), "task-1")).toBe(true);
  });

  it("removes every currently visible dot without physically deleting adds", () => {
    const selected = add(add(emptySet(), "task-1", "2@bb"), "task-1", "1@aa");

    const removed = removeObserved(selected, "task-1");

    expect(has(removed, "task-1")).toBe(false);
    expect(removed).toEqual({
      adds: { "task-1": { "1@aa": true, "2@bb": true } },
      removedDots: { "1@aa": true, "2@bb": true },
    });
  });

  it("does not mutate either input while adding, removing, or merging", () => {
    const original = add(emptySet(), "task-2", "2@bb");
    const originalSnapshot = JSON.stringify(original);
    const concurrent = add(emptySet(), "task-1", "1@aa");
    const concurrentSnapshot = JSON.stringify(concurrent);

    const added = add(original, "task-1", "3@cc");
    const removed = removeObserved(original, "task-2");
    const merged = mergeSet(original, concurrent);

    expect(JSON.stringify(original)).toBe(originalSnapshot);
    expect(JSON.stringify(concurrent)).toBe(concurrentSnapshot);
    expect(added).not.toBe(original);
    expect(removed).not.toBe(original);
    expect(merged).not.toBe(original);
  });

  it("is idempotent for duplicate add dots and duplicate merges", () => {
    const once = add(emptySet(), "task-1", "1@aa");
    const twice = add(once, "task-1", "1@aa");

    expect(twice).toEqual(once);
    expect(mergeSet(once, once)).toEqual(once);
    expect(mergeSet(mergeSet(once, twice), once)).toEqual(once);
  });

  it("returns canonical maps independent of add and merge arrival order", () => {
    const first = add(add(emptySet(), "task-z", "9@zz"), "task-a", "2@bb");
    const second = add(add(emptySet(), "task-a", "1@aa"), "task-z", "3@cc");

    const leftFirst = mergeSet(removeObserved(first, "task-z"), second);
    const rightFirst = mergeSet(second, removeObserved(first, "task-z"));

    expect(JSON.stringify(leftFirst)).toBe(JSON.stringify(rightFirst));
    expect(Object.keys(leftFirst.adds)).toEqual(["task-a", "task-z"]);
    expect(Object.keys(leftFirst.adds["task-a"])).toEqual(["1@aa", "2@bb"]);
    expect(Object.keys(leftFirst.removedDots)).toEqual(["9@zz"]);
  });

  it.each([
    ["element", () => add(emptySet(), "", "1@aa")],
    ["element", () => add(emptySet(), "   ", "1@aa")],
    ["dot", () => add(emptySet(), "task-1", "")],
    ["dot", () => add(emptySet(), "task-1", "   ")],
    ["element", () => has(emptySet(), "")],
    ["element", () => removeObserved(emptySet(), "   ")],
  ])("rejects an invalid %s identifier", (_kind, operation) => {
    expect(operation).toThrow("non-empty");
  });
});
