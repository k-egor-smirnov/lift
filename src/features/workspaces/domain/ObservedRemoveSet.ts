import type { Dot, ObservedRemoveSet } from "./WorkspaceState";

export type { ObservedRemoveSet } from "./WorkspaceState";

const requireNonEmptyIdentifier = (
  kind: "element" | "dot",
  value: unknown
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${kind} identifier: expected a non-empty string`);
  }

  return value;
};

const codeUnitCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const trueMap = (identifiers: Iterable<string>): Record<string, true> =>
  Object.fromEntries(
    [...new Set(identifiers)]
      .sort(codeUnitCompare)
      .map((identifier) => [identifier, true] as const)
  );

const canonicalSet = (
  adds: ReadonlyMap<string, ReadonlySet<Dot>>,
  removedDots: ReadonlySet<Dot>
): ObservedRemoveSet => ({
  adds: Object.fromEntries(
    [...adds.entries()]
      .sort(([left], [right]) => codeUnitCompare(left, right))
      .map(([element, dots]) => [element, trueMap(dots)] as const)
  ),
  removedDots: trueMap(removedDots),
});

const readAdds = (set: ObservedRemoveSet): Map<string, Set<Dot>> => {
  const adds = new Map<string, Set<Dot>>();

  for (const [elementValue, dots] of Object.entries(set.adds)) {
    const element = requireNonEmptyIdentifier("element", elementValue);
    const validDots = Object.keys(dots).map((dot) =>
      requireNonEmptyIdentifier("dot", dot)
    );
    adds.set(element, new Set(validDots));
  }

  return adds;
};

const readRemovedDots = (set: ObservedRemoveSet): Set<Dot> =>
  new Set(
    Object.keys(set.removedDots).map((dot) =>
      requireNonEmptyIdentifier("dot", dot)
    )
  );

const cloneCanonical = (set: ObservedRemoveSet): ObservedRemoveSet =>
  canonicalSet(readAdds(set), readRemovedDots(set));

export const emptySet = (): ObservedRemoveSet => ({
  adds: {},
  removedDots: {},
});

export const add = (
  set: ObservedRemoveSet,
  elementValue: unknown,
  dotValue: unknown
): ObservedRemoveSet => {
  const element = requireNonEmptyIdentifier("element", elementValue);
  const dot = requireNonEmptyIdentifier("dot", dotValue);
  const adds = readAdds(set);
  const dots = adds.get(element) ?? new Set<Dot>();
  dots.add(dot);
  adds.set(element, dots);

  return canonicalSet(adds, readRemovedDots(set));
};

export const removeObserved = (
  set: ObservedRemoveSet,
  elementValue: unknown
): ObservedRemoveSet => {
  const element = requireNonEmptyIdentifier("element", elementValue);
  const adds = readAdds(set);
  const removedDots = readRemovedDots(set);

  for (const dot of adds.get(element) ?? []) {
    if (!removedDots.has(dot)) {
      removedDots.add(dot);
    }
  }

  return canonicalSet(adds, removedDots);
};

export const mergeSet = (
  left: ObservedRemoveSet,
  right: ObservedRemoveSet
): ObservedRemoveSet => {
  const adds = readAdds(left);

  for (const [element, rightDots] of readAdds(right)) {
    const dots = adds.get(element) ?? new Set<Dot>();
    for (const dot of rightDots) {
      dots.add(dot);
    }
    adds.set(element, dots);
  }

  const removedDots = readRemovedDots(left);
  for (const dot of readRemovedDots(right)) {
    removedDots.add(dot);
  }

  return canonicalSet(adds, removedDots);
};

export const has = (set: ObservedRemoveSet, elementValue: unknown): boolean => {
  const element = requireNonEmptyIdentifier("element", elementValue);
  const canonical = cloneCanonical(set);
  const removedDots = canonical.removedDots;

  return Object.keys(canonical.adds[element] ?? {}).some(
    (dot) => !Object.prototype.hasOwnProperty.call(removedDots, dot)
  );
};
