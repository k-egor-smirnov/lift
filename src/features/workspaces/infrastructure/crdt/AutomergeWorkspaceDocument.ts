import * as Automerge from "@automerge/automerge";
import { z } from "zod";

import type {
  CompletionRecordState,
  ObservedRemoveSet,
  RecurrenceTemplateState,
  TaskCrdtState,
  WorkspaceState,
} from "../../domain/WorkspaceState";
import {
  canonicalCompletionLifecycle,
  assertCompletionRecordStructure,
} from "../../domain/CompletionLifecycle";
import { isValidDateOnly } from "../../domain/EffectiveDate";
import { requireAutomergeActorId } from "./ActorIdFactory";
import { AutomergeConflictReader } from "./AutomergeConflictReader";

export interface BinaryWorkspaceChange {
  readonly bytes: Uint8Array;
  readonly hash: string;
  readonly dependencies: readonly string[];
}

export type WorkspaceDocumentChange = (draft: WorkspaceState) => void;

type PlainScalar = string | number | boolean | null;
type ScalarGuard<T extends PlainScalar> = (
  value: Automerge.AutomergeValue
) => value is T;

const CANONICAL_CHANGE_HASH = /^[0-9a-f]{64}$/;

/** Protocol-owned actor used only for the deterministic schema-v1 root. */
export const WORKSPACE_GENESIS_ACTOR_ID = "00".repeat(16);

export class QuarantinedAutomergeChangeError extends Error {
  readonly name = "QuarantinedAutomergeChangeError";
  readonly reason = "invalid-schema" as const;

  constructor(
    readonly hash: string,
    readonly detail: string
  ) {
    super(`Quarantined invalid Automerge change ${hash}: ${detail}`);
  }
}

const stringGuard = (value: Automerge.AutomergeValue): value is string =>
  typeof value === "string";
const numberGuard = (value: Automerge.AutomergeValue): value is number =>
  typeof value === "number" && Number.isFinite(value);
const safeNonNegativeIntegerGuard = (
  value: Automerge.AutomergeValue
): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
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
const frequencyGuard = (
  value: Automerge.AutomergeValue
): value is RecurrenceTemplateState["rule"]["frequency"] =>
  value === "daily" || value === "weekly";
const schemaVersionGuard = (
  value: Automerge.AutomergeValue
): value is WorkspaceState["schemaVersion"] => value === 1;

const START_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const isValidTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const NonEmptyStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Expected a non-empty string");
const DateOnlySchema = z
  .string()
  .refine(isValidDateOnly, "Expected a valid YYYY-MM-DD calendar date");
const AuditInstantSchema = z.iso.datetime({ offset: true });
const CategorySchema = z.enum(["INBOX", "SIMPLE", "FOCUS"]);
const DotSetSchema = z.record(NonEmptyStringSchema, z.literal(true));
const ObservedRemoveSetSchema = z.strictObject({
  adds: z.record(NonEmptyStringSchema, DotSetSchema),
  removedDots: DotSetSchema,
});
const TaskStateSchema = z.strictObject({
  id: NonEmptyStringSchema,
  title: z.string(),
  note: z.string(),
  category: CategorySchema,
  position: z.strictObject({
    key: NonEmptyStringSchema,
    actorId: NonEmptyStringSchema,
  }),
  created: z.strictObject({
    deviceId: NonEmptyStringSchema,
    auditTime: AuditInstantSchema,
  }),
  inboxEnteredOn: DateOnlySchema.nullable(),
  deferredUntil: DateOnlySchema.nullable(),
  originalCategory: CategorySchema.nullable(),
  completion: z.enum(["active", "completed"]),
  completionEpoch: z.number().int().safe().nonnegative(),
  tags: ObservedRemoveSetSchema,
  deletionDots: DotSetSchema,
});
const RecurrenceTemplateSchema = z.strictObject({
  id: NonEmptyStringSchema,
  title: z.string(),
  note: z.string(),
  category: CategorySchema,
  rule: z.strictObject({
    frequency: z.enum(["daily", "weekly"]),
    interval: z.number().finite().int().positive(),
    weekdays: z.array(z.number().finite().int().min(0).max(6)),
    startsOn: DateOnlySchema,
    endsOn: DateOnlySchema.nullable(),
  }),
  deletionDots: DotSetSchema,
});
const MaterializedOccurrenceSchema = z.strictObject({
  templateId: NonEmptyStringSchema,
  occurrenceDate: DateOnlySchema,
  taskId: NonEmptyStringSchema,
});
const CompletionRecordSchema = z.strictObject({
  id: NonEmptyStringSchema,
  taskId: NonEmptyStringSchema,
  effectiveDate: DateOnlySchema,
  kind: z.enum(["completed", "reopened"]),
  fromCompletionEpoch: z.number().int().safe().nonnegative(),
  completionEpoch: z.number().int().safe().positive(),
  categoryAtCompletion: CategorySchema.nullable(),
  actorId: NonEmptyStringSchema,
  auditTime: AuditInstantSchema,
});
const AuditRecordSchema = z.strictObject({
  id: NonEmptyStringSchema,
  kind: NonEmptyStringSchema,
  taskId: NonEmptyStringSchema.nullable(),
  effectiveDate: DateOnlySchema.nullable(),
  actorId: NonEmptyStringSchema,
  auditTime: AuditInstantSchema,
  data: z.record(z.string(), z.string()),
});
const WorkspaceStateSchema: z.ZodType<WorkspaceState> = z.strictObject({
  schemaVersion: z.literal(1),
  workspaceId: NonEmptyStringSchema,
  settings: z.strictObject({
    timezone: NonEmptyStringSchema.refine(
      isValidTimezone,
      "Expected a valid IANA timezone"
    ),
    startOfDay: z.string().regex(START_OF_DAY_PATTERN),
  }),
  tasks: z.record(NonEmptyStringSchema, TaskStateSchema),
  dailySelections: z.record(DateOnlySchema, ObservedRemoveSetSchema),
  recurrenceTemplates: z.record(NonEmptyStringSchema, RecurrenceTemplateSchema),
  materializedOccurrences: z.record(
    NonEmptyStringSchema,
    MaterializedOccurrenceSchema
  ),
  completionRecords: z.record(NonEmptyStringSchema, CompletionRecordSchema),
  auditRecords: z.record(NonEmptyStringSchema, AuditRecordSchema),
});

function assertWorkspaceState(value: unknown): asserts value is WorkspaceState {
  const result = WorkspaceStateSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.map(String).join(".") || "<root>";
    throw new Error(
      `Invalid Automerge workspace state at ${path}: ${issue?.message ?? "unknown schema error"}`
    );
  }
}

const assertLifecycleState = (state: Readonly<WorkspaceState>): void => {
  for (const record of Object.values(state.completionRecords)) {
    assertCompletionRecordStructure(record);
    if (state.tasks[record.taskId] === undefined) {
      throw new Error("Invalid completion lifecycle task reference");
    }
  }
  for (const task of Object.values(state.tasks)) {
    const lifecycle = canonicalCompletionLifecycle(
      task.id,
      state.completionRecords
    );
    if (
      task.completion !== lifecycle.completion ||
      task.completionEpoch !== lifecycle.completionEpoch
    ) {
      throw new Error("Invalid canonical completion lifecycle state");
    }
  }
};

const sortedRecord = <T, U>(
  record: Readonly<Record<string, T>>,
  project: (value: T, key: string) => U
): Record<string, U> => {
  const result: Record<string, U> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) {
      result[key] = project(value, key);
    }
  }
  return result;
};

const canonicalDots = (
  dots: Readonly<Record<string, true>>
): Record<string, true> => sortedRecord(dots, () => true);

const canonicalObservedRemoveSet = (
  set: Readonly<ObservedRemoveSet>
): ObservedRemoveSet => ({
  adds: sortedRecord(set.adds, (dots) => canonicalDots(dots)),
  removedDots: canonicalDots(set.removedDots),
});

const canonicalDependencies = (dependencies: readonly string[]): string[] => {
  const result = [...dependencies].sort();
  for (let index = 0; index < result.length; index += 1) {
    const dependency = result[index];
    if (
      dependency === undefined ||
      !CANONICAL_CHANGE_HASH.test(dependency) ||
      (index > 0 && dependency === result[index - 1])
    ) {
      throw new Error("Invalid Automerge change dependency metadata");
    }
  }
  return result;
};

const equalStrings = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const requireRuntimeActorId = (actor: unknown): string => {
  const actorId = requireAutomergeActorId(actor);
  if (actorId === WORKSPACE_GENESIS_ACTOR_ID) {
    throw new Error("Invalid runtime actor: reserved genesis actor");
  }
  return actorId;
};

const canonicalHistoricalHeads = (heads: unknown): string[] => {
  if (!Array.isArray(heads) || heads.length === 0) {
    throw new Error(
      "Invalid historical heads: expected a non-empty array of change hashes"
    );
  }
  const canonical = [...heads].sort();
  for (let index = 0; index < canonical.length; index += 1) {
    const head = canonical[index];
    if (
      typeof head !== "string" ||
      !CANONICAL_CHANGE_HASH.test(head) ||
      (index > 0 && head === canonical[index - 1])
    ) {
      throw new Error(
        "Invalid historical heads: expected unique canonical change hashes"
      );
    }
  }
  return canonical;
};

/**
 * Infrastructure boundary for the Automerge workspace document.
 *
 * Automerge 3.3.2 normally retains changes whose dependencies are missing in a
 * hidden document queue. This adapter instead owns pending bytes outside the
 * validated document. Ready changes replay by hash on an isolated clone. A
 * schema-invalid change is removed from pending, quarantined by hash, and
 * throws without committing the candidate; its valid dependency may then be
 * retried without activating the poison change.
 */
export class AutomergeWorkspaceDocument {
  private readonly conflictReader = new AutomergeConflictReader();
  private pendingChanges = new Map<string, BinaryWorkspaceChange>();
  private readonly quarantinedHashes = new Set<string>();

  private constructor(private document: Automerge.Doc<WorkspaceState>) {}

  static create(
    state: WorkspaceState,
    actor: unknown
  ): AutomergeWorkspaceDocument {
    const actorId = requireRuntimeActorId(actor);
    const initialState = structuredClone(state);
    assertWorkspaceState(initialState);
    const empty = Automerge.init<WorkspaceState>({
      actor: WORKSPACE_GENESIS_ACTOR_ID,
    });
    const genesis = Automerge.change(
      empty,
      { message: "initialize workspace", time: 0 },
      (draft) => Object.assign(draft, initialState)
    );
    const document = Automerge.clone(genesis, { actor: actorId });
    const result = new AutomergeWorkspaceDocument(document);
    result.assertValidDocument(document);

    return result;
  }

  static load(
    snapshot: Uint8Array,
    actor: unknown
  ): AutomergeWorkspaceDocument {
    const actorId = requireRuntimeActorId(actor);
    if (!(snapshot instanceof Uint8Array) || snapshot.length === 0) {
      throw new Error("Invalid Automerge snapshot: expected non-empty bytes");
    }

    try {
      const document = Automerge.load<WorkspaceState>(snapshot.slice(), {
        actor: actorId,
      });
      const result = new AutomergeWorkspaceDocument(document);
      result.assertValidDocument(document);
      return result;
    } catch (error: unknown) {
      throw new Error(`Invalid Automerge snapshot: ${errorMessage(error)}`);
    }
  }

  change(
    message: string,
    mutate: WorkspaceDocumentChange
  ): BinaryWorkspaceChange[] {
    const before = Automerge.clone(this.document, {
      actor: Automerge.getActorId(this.document),
    });
    const after = Automerge.change(before, { message, time: 0 }, mutate);
    this.assertValidDocument(after);

    const changes = Automerge.getChanges(before, after).map((bytes) => {
      const decoded = Automerge.decodeChange(bytes);
      return {
        bytes: bytes.slice(),
        hash: decoded.hash,
        dependencies: canonicalDependencies(decoded.deps),
      };
    });
    this.document = after;
    return changes;
  }

  /** Returns a validated immutable projection at an exact causal frontier. */
  valueAt(heads: readonly string[]): Readonly<WorkspaceState> {
    const historical = this.historicalView(heads);
    return this.canonicalDocument(historical.document);
  }

  /**
   * Creates one operation-scoped change at a historical causal frontier and
   * merges that binary change into the current document.
   *
   * An operation actor is single-use. An exact retry returns no changes; any
   * attempt to reuse it with different metadata fails before Automerge can
   * fork the actor sequence.
   */
  changeAt(
    heads: readonly string[],
    operationActor: unknown,
    messageValue: unknown,
    mutate: WorkspaceDocumentChange
  ): BinaryWorkspaceChange[] {
    const historical = this.historicalView(heads);
    const actorId = requireRuntimeActorId(operationActor);
    const message =
      typeof messageValue === "string" && messageValue.length > 0
        ? messageValue
        : (() => {
            throw new Error("Invalid historical change message");
          })();
    if (typeof mutate !== "function") {
      throw new Error("Invalid historical change callback");
    }

    const pendingActorCollision = [...this.pendingChanges.values()].some(
      ({ bytes }) => Automerge.decodeChange(bytes).actor === actorId
    );
    if (pendingActorCollision) {
      throw new Error(
        "Invalid pending operation actor reuse: missing dependencies prevent safe actor-sequence validation"
      );
    }

    const authored = Automerge.getAllChanges(this.document)
      .map((bytes) => ({
        bytes: bytes.slice(),
        decoded: Automerge.decodeChange(bytes),
      }))
      .filter(({ decoded }) => decoded.actor === actorId);
    if (authored.length > 0) {
      const existing = authored[0];
      if (
        authored.length === 1 &&
        existing !== undefined &&
        existing.decoded.seq === 1 &&
        existing.decoded.time === 0 &&
        existing.decoded.message === message &&
        equalStrings(
          canonicalDependencies(existing.decoded.deps),
          historical.heads
        )
      ) {
        const expected = this.reconstructHistoricalChange(
          historical.heads,
          actorId,
          message,
          mutate
        );
        if (
          expected !== undefined &&
          expected.hash === existing.decoded.hash &&
          equalBytes(expected.bytes, existing.bytes)
        ) {
          return [];
        }
        throw new Error(
          "Invalid operation actor reuse: existing payload differs from deterministic expected change"
        );
      }
      throw new Error(
        "Invalid operation actor reuse: operation metadata would fork its Automerge sequence"
      );
    }

    const runtimeActor = Automerge.getActorId(this.document);
    const knownBefore = this.knownChangeHashes(this.document);
    const operationDocument = Automerge.clone(this.document, {
      actor: actorId,
    });
    const result = Automerge.changeAt(
      operationDocument,
      historical.heads,
      { message, time: 0 },
      mutate
    );
    if (result.newHeads === null) {
      return [];
    }

    const created = Automerge.getAllChanges(result.newDoc)
      .map((bytes): BinaryWorkspaceChange => {
        const decoded = Automerge.decodeChange(bytes);
        return {
          bytes: bytes.slice(),
          hash: decoded.hash,
          dependencies: canonicalDependencies(decoded.deps),
        };
      })
      .filter(({ hash }) => !knownBefore.has(hash));
    if (created.length !== 1) {
      throw new Error("Invalid historical change: expected exactly one change");
    }
    const change = created[0];
    if (change === undefined) {
      throw new Error("Invalid historical change: missing created change");
    }
    const decoded = Automerge.decodeChange(change.bytes);
    if (
      decoded.actor !== actorId ||
      decoded.seq !== 1 ||
      decoded.time !== 0 ||
      decoded.message !== message ||
      !equalStrings(change.dependencies, historical.heads)
    ) {
      throw new Error("Invalid historical change actor or causal metadata");
    }

    const branch = Automerge.view(result.newDoc, [...result.newHeads].sort());
    this.assertValidDocument(branch);
    this.assertValidDocument(result.newDoc);
    const current = Automerge.clone(this.document, { actor: runtimeActor });
    const [applied] = Automerge.applyChanges(current, [change.bytes.slice()]);
    this.assertValidDocument(applied);
    this.document = applied;

    return [
      {
        bytes: change.bytes.slice(),
        hash: change.hash,
        dependencies: [...change.dependencies],
      },
    ];
  }

  updateText(
    path: readonly (string | number)[],
    nextText: string
  ): BinaryWorkspaceChange[] {
    if (!Array.isArray(path)) {
      throw new Error("Invalid collaborative text path");
    }

    const [collection, entityId, property] = path;
    const validCollection =
      collection === "tasks" || collection === "recurrenceTemplates";
    const validProperty = property === "title" || property === "note";
    const collectionValue =
      collection === "tasks"
        ? this.document.tasks
        : collection === "recurrenceTemplates"
          ? this.document.recurrenceTemplates
          : undefined;

    if (
      path.length !== 3 ||
      !validCollection ||
      typeof entityId !== "string" ||
      entityId.length === 0 ||
      !validProperty ||
      collectionValue === undefined ||
      !Object.hasOwn(collectionValue, entityId) ||
      typeof nextText !== "string"
    ) {
      throw new Error("Invalid collaborative text path");
    }

    return this.change("update collaborative text", (draft) => {
      Automerge.updateText(draft, [collection, entityId, property], nextText);
    });
  }

  apply(changes: readonly BinaryWorkspaceChange[]): void {
    const verified = changes.map((change) => this.verifyIncomingChange(change));
    for (const change of verified) {
      if (this.quarantinedHashes.has(change.hash)) {
        throw new Error(`Rejected quarantined Automerge change ${change.hash}`);
      }
    }

    const knownHashes = this.knownChangeHashes(this.document);
    const candidatePending = new Map(this.pendingChanges);
    for (const change of verified) {
      if (!knownHashes.has(change.hash) && !candidatePending.has(change.hash)) {
        candidatePending.set(change.hash, change);
      }
    }

    const candidate = Automerge.clone(this.document, {
      actor: Automerge.getActorId(this.document),
    });
    const replayed = this.replayPending(
      candidate,
      candidatePending,
      knownHashes
    );
    this.assertValidDocument(replayed.document);

    if (replayed.appliedCount > 0) {
      this.document = replayed.document;
    }
    this.pendingChanges = replayed.pending;
  }

  save(): Uint8Array {
    return Automerge.save(this.document).slice();
  }

  heads(): readonly string[] {
    return [...Automerge.getHeads(this.document)].sort();
  }

  containsHeads(heads: readonly string[]): boolean {
    return Automerge.hasHeads(this.document, [...heads]);
  }

  mergeSnapshot(snapshot: Uint8Array): void {
    if (!(snapshot instanceof Uint8Array) || snapshot.length === 0) {
      throw new Error("Invalid Automerge snapshot: expected non-empty bytes");
    }
    try {
      const incoming = Automerge.load<WorkspaceState>(snapshot.slice());
      this.assertValidDocument(incoming);
      const merged = Automerge.merge(this.document, incoming);
      this.assertValidDocument(merged);
      this.document = merged;
    } catch (error: unknown) {
      throw new Error(
        `Invalid Automerge snapshot merge: ${errorMessage(error)}`
      );
    }
  }

  value(): Readonly<WorkspaceState> {
    return this.canonical();
  }

  canonical(): WorkspaceState {
    return this.canonicalDocument(this.document);
  }

  private verifyIncomingChange(
    change: BinaryWorkspaceChange
  ): BinaryWorkspaceChange {
    if (!(change.bytes instanceof Uint8Array) || change.bytes.length === 0) {
      throw new Error("Invalid Automerge change: expected non-empty bytes");
    }
    if (!CANONICAL_CHANGE_HASH.test(change.hash)) {
      throw new Error("Invalid Automerge change hash metadata");
    }
    if (!Array.isArray(change.dependencies)) {
      throw new Error("Invalid Automerge change dependency metadata");
    }

    const bytes = change.bytes.slice();
    let decoded: Automerge.DecodedChange;
    try {
      decoded = Automerge.decodeChange(bytes);
    } catch (error: unknown) {
      throw new Error(`Invalid Automerge change: ${errorMessage(error)}`);
    }

    if (decoded.hash !== change.hash) {
      throw new Error("Automerge change hash mismatch");
    }

    const canonicalDeclared = canonicalDependencies(change.dependencies);
    if (!equalStrings(change.dependencies, canonicalDeclared)) {
      throw new Error("Automerge change dependencies are not canonical");
    }
    const canonicalDecoded = canonicalDependencies(decoded.deps);
    if (!equalStrings(change.dependencies, canonicalDecoded)) {
      throw new Error("Automerge change dependencies mismatch");
    }
    if (decoded.actor === WORKSPACE_GENESIS_ACTOR_ID) {
      throw new QuarantinedAutomergeChangeError(
        decoded.hash,
        "Reserved Automerge genesis actor cannot author incoming changes"
      );
    }

    return {
      bytes,
      hash: decoded.hash,
      dependencies: canonicalDecoded,
    };
  }

  private knownChangeHashes(
    document: Automerge.Doc<WorkspaceState>
  ): Set<string> {
    return new Set(
      Automerge.getAllChanges(document).map(
        (bytes) => Automerge.decodeChange(bytes).hash
      )
    );
  }

  private historicalView(headsValue: readonly string[]): {
    readonly heads: string[];
    readonly document: Automerge.Doc<WorkspaceState>;
  } {
    const heads = canonicalHistoricalHeads(headsValue);
    if (!Automerge.hasHeads(this.document, heads)) {
      throw new Error("Invalid unavailable historical heads");
    }

    const changes = new Map(
      Automerge.getAllChanges(this.document).map((bytes) => {
        const decoded = Automerge.decodeChange(bytes);
        return [decoded.hash, canonicalDependencies(decoded.deps)] as const;
      })
    );
    const ancestorsOf = (hash: string): Set<string> => {
      const ancestors = new Set<string>();
      const pending = [...(changes.get(hash) ?? [])];
      while (pending.length > 0) {
        const dependency = pending.pop();
        if (dependency === undefined || ancestors.has(dependency)) continue;
        ancestors.add(dependency);
        pending.push(...(changes.get(dependency) ?? []));
      }
      return ancestors;
    };
    for (const head of heads) {
      for (const other of heads) {
        if (head !== other && ancestorsOf(other).has(head)) {
          throw new Error(
            "Invalid historical frontier: a head is an ancestor of another head"
          );
        }
      }
    }

    try {
      const document = Automerge.view(this.document, heads);
      this.assertValidDocument(document);
      return { heads, document };
    } catch (error: unknown) {
      throw new Error(`Invalid historical frontier: ${errorMessage(error)}`);
    }
  }

  private reconstructHistoricalChange(
    heads: readonly string[],
    actorId: string,
    message: string,
    mutate: WorkspaceDocumentChange
  ): BinaryWorkspaceChange | undefined {
    const changes = new Map(
      Automerge.getAllChanges(this.document).map((bytes) => {
        const decoded = Automerge.decodeChange(bytes);
        return [
          decoded.hash,
          {
            bytes: bytes.slice(),
            dependencies: canonicalDependencies(decoded.deps),
          },
        ] as const;
      })
    );
    const ordered: Uint8Array[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const visit = (hash: string): void => {
      if (visited.has(hash)) return;
      if (visiting.has(hash)) {
        throw new Error("Invalid historical dependency cycle");
      }
      const change = changes.get(hash);
      if (change === undefined) {
        throw new Error("Invalid unavailable historical dependency closure");
      }
      visiting.add(hash);
      for (const dependency of change.dependencies) visit(dependency);
      visiting.delete(hash);
      visited.add(hash);
      ordered.push(change.bytes.slice());
    };
    for (const head of heads) visit(head);

    let base = Automerge.init<WorkspaceState>({ actor: actorId });
    if (ordered.length > 0) {
      [base] = Automerge.applyChanges(
        base,
        ordered.map((bytes) => bytes.slice())
      );
    }
    this.assertValidDocument(base);
    const reconstructedHeads = [...Automerge.getHeads(base)].sort();
    if (!equalStrings(reconstructedHeads, heads)) {
      throw new Error("Invalid reconstructed historical frontier");
    }

    const after = Automerge.change(base, { message, time: 0 }, mutate);
    this.assertValidDocument(after);
    const expected = Automerge.getChanges(base, after);
    if (expected.length === 0) return undefined;
    if (expected.length !== 1) {
      throw new Error(
        "Invalid deterministic historical change: expected exactly one change"
      );
    }
    const bytes = expected[0];
    if (bytes === undefined) {
      throw new Error("Invalid deterministic historical change: missing bytes");
    }
    const decoded = Automerge.decodeChange(bytes);
    const dependencies = canonicalDependencies(decoded.deps);
    if (
      decoded.actor !== actorId ||
      decoded.seq !== 1 ||
      decoded.time !== 0 ||
      decoded.message !== message ||
      !equalStrings(dependencies, heads)
    ) {
      throw new Error(
        "Invalid deterministic historical change actor or causal metadata"
      );
    }
    return {
      bytes: bytes.slice(),
      hash: decoded.hash,
      dependencies,
    };
  }

  private replayPending(
    initial: Automerge.Doc<WorkspaceState>,
    pending: Map<string, BinaryWorkspaceChange>,
    knownHashes: Set<string>
  ): {
    readonly document: Automerge.Doc<WorkspaceState>;
    readonly pending: Map<string, BinaryWorkspaceChange>;
    readonly appliedCount: number;
  } {
    let document = initial;
    let appliedCount = 0;
    const readyChanges = (): BinaryWorkspaceChange[] =>
      [...pending.values()]
        .filter((change) =>
          change.dependencies.every((dependency) => knownHashes.has(dependency))
        )
        .sort((left, right) =>
          left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0
        );
    let ready = readyChanges();

    while (ready.length > 0) {
      for (const change of ready) {
        try {
          this.validateInDependencyContext(document, change);
          const [next] = Automerge.applyChanges(document, [
            change.bytes.slice(),
          ]);
          this.assertValidDocument(next);
          document = next;
        } catch (error: unknown) {
          this.pendingChanges.delete(change.hash);
          this.quarantinedHashes.add(change.hash);
          throw new QuarantinedAutomergeChangeError(
            change.hash,
            errorMessage(error)
          );
        }

        knownHashes.add(change.hash);
        pending.delete(change.hash);
        appliedCount += 1;
      }

      ready = readyChanges();
    }

    return { document, pending, appliedCount };
  }

  private validateInDependencyContext(
    document: Automerge.Doc<WorkspaceState>,
    change: BinaryWorkspaceChange
  ): void {
    const dependencyView = Automerge.view(document, [...change.dependencies]);
    const isolated = Automerge.clone(dependencyView, {
      actor: Automerge.getActorId(document),
    });
    const [result] = Automerge.applyChanges(isolated, [change.bytes.slice()]);
    this.assertValidDocument(result);
  }

  private assertValidDocument(document: Automerge.Doc<WorkspaceState>): void {
    assertWorkspaceState(document);
    let canonical: WorkspaceState;
    try {
      canonical = this.canonicalDocument(document);
    } catch (error) {
      throw new Error(
        `Invalid Automerge workspace state at completionRecords: ${errorMessage(
          error
        )}`
      );
    }
    assertWorkspaceState(canonical);
    try {
      assertLifecycleState(canonical);
    } catch (error) {
      throw new Error(
        `Invalid Automerge workspace state at completionRecords: ${errorMessage(
          error
        )}`
      );
    }
  }

  private canonicalDocument(
    document: Automerge.Doc<WorkspaceState>
  ): WorkspaceState {
    const completionRecords = sortedRecord(
      document.completionRecords,
      (record): CompletionRecordState => ({
        id: this.scalar(record, "id", record.id, stringGuard),
        taskId: this.scalar(record, "taskId", record.taskId, stringGuard),
        effectiveDate: this.scalar(
          record,
          "effectiveDate",
          record.effectiveDate,
          stringGuard
        ),
        kind: this.scalar(
          record,
          "kind",
          record.kind,
          (value): value is "completed" | "reopened" =>
            value === "completed" || value === "reopened"
        ),
        fromCompletionEpoch: this.scalar(
          record,
          "fromCompletionEpoch",
          record.fromCompletionEpoch,
          safeNonNegativeIntegerGuard
        ),
        completionEpoch: this.scalar(
          record,
          "completionEpoch",
          record.completionEpoch,
          safeNonNegativeIntegerGuard
        ),
        categoryAtCompletion: this.scalar(
          record,
          "categoryAtCompletion",
          record.categoryAtCompletion,
          nullableCategoryGuard
        ),
        actorId: this.scalar(record, "actorId", record.actorId, stringGuard),
        auditTime: this.scalar(
          record,
          "auditTime",
          record.auditTime,
          stringGuard
        ),
      })
    );
    return {
      schemaVersion: this.scalar(
        document,
        "schemaVersion",
        document.schemaVersion,
        schemaVersionGuard
      ),
      workspaceId: this.scalar(
        document,
        "workspaceId",
        document.workspaceId,
        stringGuard
      ),
      settings: {
        timezone: this.scalar(
          document.settings,
          "timezone",
          document.settings.timezone,
          stringGuard
        ),
        startOfDay: this.scalar(
          document.settings,
          "startOfDay",
          document.settings.startOfDay,
          stringGuard
        ),
      },
      tasks: sortedRecord(document.tasks, (task) =>
        this.canonicalTask(task, completionRecords)
      ),
      dailySelections: sortedRecord(document.dailySelections, (selection) =>
        canonicalObservedRemoveSet(selection)
      ),
      recurrenceTemplates: sortedRecord(
        document.recurrenceTemplates,
        (template) => this.canonicalRecurrenceTemplate(template)
      ),
      materializedOccurrences: sortedRecord(
        document.materializedOccurrences,
        (occurrence) => ({
          templateId: this.scalar(
            occurrence,
            "templateId",
            occurrence.templateId,
            stringGuard
          ),
          occurrenceDate: this.scalar(
            occurrence,
            "occurrenceDate",
            occurrence.occurrenceDate,
            stringGuard
          ),
          taskId: this.scalar(
            occurrence,
            "taskId",
            occurrence.taskId,
            stringGuard
          ),
        })
      ),
      completionRecords,
      auditRecords: sortedRecord(document.auditRecords, (record) => ({
        id: this.scalar(record, "id", record.id, stringGuard),
        kind: this.scalar(record, "kind", record.kind, stringGuard),
        taskId: this.scalar(
          record,
          "taskId",
          record.taskId,
          nullableStringGuard
        ),
        effectiveDate: this.scalar(
          record,
          "effectiveDate",
          record.effectiveDate,
          nullableStringGuard
        ),
        actorId: this.scalar(record, "actorId", record.actorId, stringGuard),
        auditTime: this.scalar(
          record,
          "auditTime",
          record.auditTime,
          stringGuard
        ),
        data: sortedRecord(record.data, (value, key) =>
          this.scalar(record.data, key, value, stringGuard)
        ),
      })),
    };
  }

  private scalar<T extends PlainScalar>(
    object: object,
    property: string | number,
    fallback: T,
    guard: ScalarGuard<T>
  ): T {
    return (
      this.conflictReader.readScalar(object, property, guard)?.value ?? fallback
    );
  }

  private canonicalTask(
    task: TaskCrdtState,
    completionRecords: Readonly<Record<string, CompletionRecordState>>
  ): TaskCrdtState {
    const taskId = this.scalar(task, "id", task.id, stringGuard);
    const lifecycle = canonicalCompletionLifecycle(taskId, completionRecords);
    return {
      id: taskId,
      title: this.scalar(task, "title", task.title, stringGuard),
      note: this.scalar(task, "note", task.note, stringGuard),
      category: this.scalar(task, "category", task.category, categoryGuard),
      position: {
        key: this.scalar(task.position, "key", task.position.key, stringGuard),
        actorId: this.scalar(
          task.position,
          "actorId",
          task.position.actorId,
          stringGuard
        ),
      },
      created: {
        deviceId: this.scalar(
          task.created,
          "deviceId",
          task.created.deviceId,
          stringGuard
        ),
        auditTime: this.scalar(
          task.created,
          "auditTime",
          task.created.auditTime,
          stringGuard
        ),
      },
      inboxEnteredOn: this.scalar(
        task,
        "inboxEnteredOn",
        task.inboxEnteredOn,
        nullableStringGuard
      ),
      deferredUntil: this.scalar(
        task,
        "deferredUntil",
        task.deferredUntil,
        nullableStringGuard
      ),
      originalCategory: this.scalar(
        task,
        "originalCategory",
        task.originalCategory,
        nullableCategoryGuard
      ),
      completion: lifecycle.completion,
      completionEpoch: lifecycle.completionEpoch,
      tags: canonicalObservedRemoveSet(task.tags),
      deletionDots: canonicalDots(task.deletionDots),
    };
  }

  private canonicalRecurrenceTemplate(
    template: RecurrenceTemplateState
  ): RecurrenceTemplateState {
    return {
      id: this.scalar(template, "id", template.id, stringGuard),
      title: this.scalar(template, "title", template.title, stringGuard),
      note: this.scalar(template, "note", template.note, stringGuard),
      category: this.scalar(
        template,
        "category",
        template.category,
        categoryGuard
      ),
      rule: {
        frequency: this.scalar(
          template.rule,
          "frequency",
          template.rule.frequency,
          frequencyGuard
        ),
        interval: this.scalar(
          template.rule,
          "interval",
          template.rule.interval,
          numberGuard
        ),
        weekdays: Array.from(template.rule.weekdays),
        startsOn: this.scalar(
          template.rule,
          "startsOn",
          template.rule.startsOn,
          stringGuard
        ),
        endsOn: this.scalar(
          template.rule,
          "endsOn",
          template.rule.endsOn,
          nullableStringGuard
        ),
      },
      deletionDots: canonicalDots(template.deletionDots),
    };
  }
}
