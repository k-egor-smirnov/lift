import type { WorkspaceTaskTextPath } from "../../../workspaces/application/commands/WorkspaceCommand";
import type { CurrentActor } from "../../../workspaces/application/ports/CurrentActor";
import type { CurrentWorkspace } from "../../../workspaces/application/ports/CurrentWorkspace";
import type {
  CommitResult,
  WorkspaceUnitOfWork,
} from "../../../workspaces/application/ports/WorkspaceUnitOfWork";
import { minimalTextSplice } from "../../../workspaces/application/text/minimalTextSplice";

export interface CollaborativeTextViewModelDependencies {
  readonly workspace: CurrentWorkspace;
  readonly actor: CurrentActor;
  readonly unitOfWork: WorkspaceUnitOfWork;
}

export interface CollaborativeTextProjection {
  readonly workspaceId: string;
  readonly taskId: string;
  readonly path: WorkspaceTaskTextPath;
  readonly text: string;
  /** Exact authoritative Automerge frontier for `text`. */
  readonly heads: readonly string[];
  /** Sorted causal proof containing every change reachable by `heads`. */
  readonly includedChangeHashes: readonly string[];
}

export interface CollaborativeTextSession {
  readonly taskId: string;
  readonly path: WorkspaceTaskTextPath;
  readonly initialProjection: CollaborativeTextProjection;
}

export interface CollaborativeTextSnapshot {
  readonly path: WorkspaceTaskTextPath;
  readonly text: string;
  readonly projectedText: string;
  readonly focused: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

type Listener = () => void;

export interface CollaborativeTextViewModel {
  readonly getSnapshot: () => CollaborativeTextSnapshot;
  readonly subscribe: (listener: Listener) => () => void;
  readonly setText: (text: string) => void;
  readonly applyProjection: (
    projection: CollaborativeTextProjection
  ) => boolean;
  readonly focus: () => void;
  readonly blur: () => Promise<void>;
  readonly flush: () => Promise<void>;
  readonly retry: () => Promise<void>;
}

const CANONICAL_CHANGE_HASH = /^[0-9a-f]{64}$/;

const asError = (reason: unknown): Error =>
  reason instanceof Error ? reason : new Error(String(reason));

const equalStrings = (
  left: readonly string[],
  right: readonly string[]
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const canonicalHashes = (
  values: readonly string[],
  field: string
): readonly string[] => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`Invalid ${field}: expected at least one change hash`);
  }
  const canonical = [...values].sort();
  for (let index = 0; index < canonical.length; index += 1) {
    const value = canonical[index];
    if (
      value === undefined ||
      !CANONICAL_CHANGE_HASH.test(value) ||
      (index > 0 && value === canonical[index - 1])
    ) {
      throw new Error(`Invalid ${field}: expected unique change hashes`);
    }
  }
  if (!equalStrings(values, canonical)) {
    throw new Error(`Invalid ${field}: expected sorted change hashes`);
  }
  return canonical;
};

const normalizeProjection = (
  input: CollaborativeTextProjection
): CollaborativeTextProjection => {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.workspaceId !== "string" ||
    input.workspaceId.trim().length === 0 ||
    typeof input.taskId !== "string" ||
    input.taskId.trim().length === 0 ||
    (input.path !== "title" && input.path !== "note") ||
    typeof input.text !== "string"
  ) {
    throw new Error("Invalid collaborative text projection");
  }
  const heads = canonicalHashes(input.heads, "projection heads");
  const includedChangeHashes = canonicalHashes(
    input.includedChangeHashes,
    "projection causal proof"
  );
  const included = new Set(includedChangeHashes);
  if (heads.some((head) => !included.has(head))) {
    throw new Error("Invalid projection causal proof: a head is not included");
  }
  return {
    workspaceId: input.workspaceId,
    taskId: input.taskId,
    path: input.path,
    text: input.text,
    heads,
    includedChangeHashes,
  };
};

const isSuperset = (
  candidate: ReadonlySet<string>,
  required: Iterable<string>
): boolean => {
  for (const hash of required) {
    if (!candidate.has(hash)) return false;
  }
  return true;
};

class CollaborativeTextSessionViewModel implements CollaborativeTextViewModel {
  private readonly listeners = new Set<Listener>();
  private readonly workspaceId: string;
  private readonly taskId: string;
  private readonly path: WorkspaceTaskTextPath;
  private snapshot: CollaborativeTextSnapshot;
  private acceptedProjection: CollaborativeTextProjection;
  private acceptedChanges: ReadonlySet<string>;
  private readonly acknowledgedLocalChanges = new Set<string>();
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private branchText: string;
  private branchHeads: readonly string[];
  private commitFailure: Error | null = null;
  private validationFailure: Error | null = null;

  constructor(
    private readonly dependencies: CollaborativeTextViewModelDependencies,
    session: CollaborativeTextSession
  ) {
    this.workspaceId = dependencies.workspace.requireId();
    this.taskId = session.taskId;
    this.path = session.path;
    const initial = normalizeProjection(session.initialProjection);
    this.assertIdentity(initial);
    const validation = this.validate(initial.text);
    if (validation) throw validation;

    this.acceptedProjection = initial;
    this.acceptedChanges = new Set(initial.includedChangeHashes);
    this.branchText = initial.text;
    this.branchHeads = initial.heads;
    this.snapshot = {
      path: this.path,
      text: initial.text,
      projectedText: initial.text,
      focused: false,
      dirty: false,
      saving: false,
      error: null,
    };
  }

  readonly getSnapshot = (): CollaborativeTextSnapshot => this.snapshot;

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly focus = (): void => {
    this.update({ focused: true });
  };

  readonly blur = async (): Promise<void> => {
    this.update({ focused: false });
    await this.flush();
    this.reconcileProjection();
  };

  readonly setText = (text: string): void => {
    if (text === this.snapshot.text) return;

    this.validationFailure = this.validate(text);
    if (this.validationFailure === null) {
      try {
        minimalTextSplice(text, text);
      } catch (error) {
        this.validationFailure = asError(error);
      }
    }
    this.update({
      text,
      dirty: true,
      error: this.currentErrorMessage(),
    });

    if (this.validationFailure || this.commitFailure) return;
    this.enqueueDesiredText(text);
  };

  readonly applyProjection = (input: CollaborativeTextProjection): boolean => {
    const candidate = normalizeProjection(input);
    this.assertIdentity(candidate);
    const candidateChanges = new Set(candidate.includedChangeHashes);
    if (
      !isSuperset(candidateChanges, this.acceptedChanges) ||
      !isSuperset(candidateChanges, this.acknowledgedLocalChanges)
    ) {
      return false;
    }

    if (
      equalStrings(
        candidate.includedChangeHashes,
        this.acceptedProjection.includedChangeHashes
      )
    ) {
      if (
        candidate.text !== this.acceptedProjection.text ||
        !equalStrings(candidate.heads, this.acceptedProjection.heads)
      ) {
        throw new Error("Conflicting projection for the same causal proof");
      }
      return true;
    }

    this.acceptedProjection = candidate;
    this.acceptedChanges = candidateChanges;
    this.update({ projectedText: candidate.text });
    this.reconcileProjection();
    return true;
  };

  readonly flush = async (): Promise<void> => {
    let observed = this.tail;
    await observed;
    while (observed !== this.tail) {
      observed = this.tail;
      await observed;
    }
    const error = this.validationFailure ?? this.commitFailure;
    if (error) throw error;
  };

  readonly retry = async (): Promise<void> => {
    await this.flushPendingWithoutErrorCheck();
    if (this.validationFailure) throw this.validationFailure;
    if (!this.commitFailure) return this.flush();

    this.commitFailure = null;
    this.update({ error: null, dirty: true });
    this.enqueueDesiredText(this.snapshot.text);
    await this.flush();
  };

  private enqueueDesiredText(targetText: string): void {
    this.pendingCount += 1;
    this.update({ saving: true, dirty: true, error: null });

    const commit = async (): Promise<void> => {
      try {
        if (this.commitFailure) return;
        const splice = minimalTextSplice(this.branchText, targetText);
        if (splice === null) return;
        const { actorId } = this.dependencies.actor.require();
        const result = await this.dependencies.unitOfWork.commit({
          type: "SpliceTaskText",
          workspaceId: this.workspaceId,
          actorId,
          operationId: this.dependencies.actor.nextOperationId(),
          taskId: this.taskId,
          path: this.path,
          baseHeads: [...this.branchHeads],
          ...splice,
        });
        const changeHash = this.requireSingleLocalChange(result);
        this.branchText = targetText;
        this.branchHeads = [changeHash];
        this.acknowledgedLocalChanges.add(changeHash);
      } catch (error) {
        this.commitFailure = asError(error);
        this.update({ error: this.currentErrorMessage() });
      } finally {
        this.pendingCount -= 1;
        if (this.pendingCount === 0) {
          this.updateAfterQueue();
        }
      }
    };

    this.tail = this.tail.then(commit, commit);
  }

  private requireSingleLocalChange(result: CommitResult): string {
    if (result.workspaceId !== this.workspaceId) {
      throw new Error("Text commit returned a different workspace");
    }
    if (result.changeHashes.length !== 1) {
      throw new Error("Text commit must return exactly one local change hash");
    }
    const [changeHash] = canonicalHashes(
      result.changeHashes,
      "text commit change hashes"
    );
    if (changeHash === undefined) {
      throw new Error("Text commit did not return a local change hash");
    }
    return changeHash;
  }

  private updateAfterQueue(): void {
    const hasError =
      this.commitFailure !== null || this.validationFailure !== null;
    this.update({
      saving: false,
      dirty: true,
      error: this.currentErrorMessage(),
    });
    if (!hasError) this.reconcileProjection();
  }

  private reconcileProjection(): void {
    if (
      this.pendingCount > 0 ||
      this.commitFailure ||
      this.validationFailure ||
      this.snapshot.text !== this.branchText ||
      !isSuperset(this.acceptedChanges, this.acknowledgedLocalChanges)
    ) {
      return;
    }
    this.branchText = this.acceptedProjection.text;
    this.branchHeads = this.acceptedProjection.heads;
    this.update({
      text: this.acceptedProjection.text,
      projectedText: this.acceptedProjection.text,
      dirty: false,
      error: null,
    });
  }

  private async flushPendingWithoutErrorCheck(): Promise<void> {
    let observed = this.tail;
    await observed;
    while (observed !== this.tail) {
      observed = this.tail;
      await observed;
    }
  }

  private assertIdentity(projection: CollaborativeTextProjection): void {
    if (
      projection.workspaceId !== this.workspaceId ||
      projection.taskId !== this.taskId ||
      projection.path !== this.path
    ) {
      throw new Error("Projection identity does not match the editing session");
    }
  }

  private validate(text: string): Error | null {
    if (this.path === "title" && text.trim().length === 0) {
      return new Error("Title cannot be empty");
    }
    return null;
  }

  private currentErrorMessage(): string | null {
    return (this.validationFailure ?? this.commitFailure)?.message ?? null;
  }

  private update(patch: Partial<CollaborativeTextSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (
      next.path === this.snapshot.path &&
      next.text === this.snapshot.text &&
      next.projectedText === this.snapshot.projectedText &&
      next.focused === this.snapshot.focused &&
      next.dirty === this.snapshot.dirty &&
      next.saving === this.snapshot.saving &&
      next.error === this.snapshot.error
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

export const createCollaborativeTextViewModel = (
  dependencies: CollaborativeTextViewModelDependencies,
  session: CollaborativeTextSession
): CollaborativeTextViewModel =>
  new CollaborativeTextSessionViewModel(dependencies, session);
