import * as Automerge from "@automerge/automerge";
import { describe, expect, it, vi } from "vitest";

import type { WorkspaceState } from "../../../domain/WorkspaceState";
import { ActorIdFactory } from "../ActorIdFactory";
import {
  AutomergeWorkspaceDocument,
  QuarantinedAutomergeChangeError,
  WORKSPACE_GENESIS_ACTOR_ID,
  type BinaryWorkspaceChange,
} from "../AutomergeWorkspaceDocument";

const actor = (byte: string): string => byte.repeat(16);

const workspaceState = (): WorkspaceState => ({
  schemaVersion: 1,
  workspaceId: "workspace-1",
  settings: { timezone: "Europe/Moscow", startOfDay: "04:00" },
  tasks: {
    task: {
      id: "task",
      title: "task",
      note: "note",
      category: "INBOX",
      position: { key: "a0", actorId: actor("11") },
      created: { deviceId: "DEVICE", auditTime: "2026-07-22T10:00:00Z" },
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
  recurrenceTemplates: {
    recurring: {
      id: "recurring",
      title: "repeat",
      note: "template note",
      category: "FOCUS",
      rule: {
        frequency: "weekly",
        interval: 1,
        weekdays: [1, 3],
        startsOn: "2026-07-22",
        endsOn: null,
      },
      deletionDots: {},
    },
  },
  materializedOccurrences: {},
  completionRecords: {},
  auditRecords: {},
});

const firstChange = (changes: readonly BinaryWorkspaceChange[]) => {
  expect(changes).toHaveLength(1);
  const change = changes[0];
  if (change === undefined) {
    throw new Error("Expected one binary workspace change");
  }
  return change;
};

const binaryChanges = (
  changes: readonly Uint8Array[]
): BinaryWorkspaceChange[] =>
  changes.map((bytes) => {
    const decoded = Automerge.decodeChange(bytes);
    return {
      bytes: bytes.slice(),
      hash: decoded.hash,
      dependencies: [...decoded.deps].sort(),
    };
  });

const rawSnapshot = (state: WorkspaceState, actorId: string): Uint8Array => {
  const empty = Automerge.init<WorkspaceState>({ actor: actorId });
  const document = Automerge.change(empty, { time: 0 }, (draft) => {
    Object.assign(draft, state);
  });
  return Automerge.save(document);
};

const invalidTitleChange = (
  snapshot: Uint8Array,
  actorId: string
): BinaryWorkspaceChange => {
  const before = Automerge.load<WorkspaceState>(snapshot, { actor: actorId });
  const after = Automerge.change(
    before,
    { message: "invalid title", time: 0 },
    (draft) => {
      Reflect.set(draft.tasks.task, "title", 42);
    }
  );
  return firstChange(binaryChanges(Automerge.getChanges(before, after)));
};

const forgedGenesisActorChange = (
  snapshot: Uint8Array
): BinaryWorkspaceChange => {
  const before = Automerge.load<WorkspaceState>(snapshot, {
    actor: WORKSPACE_GENESIS_ACTOR_ID,
  });
  const after = Automerge.change(
    before,
    { message: "forged genesis actor change", time: 0 },
    (draft) => {
      draft.tasks.task.category = "FOCUS";
    }
  );
  return firstChange(binaryChanges(Automerge.getChanges(before, after)));
};

const expectUnchanged = (
  document: AutomergeWorkspaceDocument,
  before: {
    readonly heads: readonly string[];
    readonly canonical: WorkspaceState;
    readonly snapshot: Uint8Array;
    readonly value: Readonly<WorkspaceState>;
  }
): void => {
  expect(document.heads()).toEqual(before.heads);
  expect(document.canonical()).toEqual(before.canonical);
  expect(document.save()).toEqual(before.snapshot);
  expect(document.value()).toEqual(before.value);
};

const captureDocument = (document: AutomergeWorkspaceDocument) => ({
  heads: document.heads(),
  canonical: document.canonical(),
  snapshot: document.save(),
  value: document.value(),
});

describe("ActorIdFactory", () => {
  it("hashes the three NUL-delimited identity components with SHA-256", async () => {
    await expect(
      new ActorIdFactory().create(
        "profile-1",
        "@alice:example.org",
        "DEVICE-42"
      )
    ).resolves.toBe(
      "b530e710cbe061e382886d24a7d258fb192fb05636a04f1387a31b7c71b0a28e"
    );
  });

  it("returns stable lowercase 64-character hex instead of a Matrix device ID", async () => {
    const factory = new ActorIdFactory();
    const first = await factory.create("profile", "@alice:example.org", "aabb");
    const second = await factory.create(
      "profile",
      "@alice:example.org",
      "aabb"
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe("aabb");
  });

  it.each([
    ["", "@alice:example.org", "DEVICE"],
    ["profile", " ", "DEVICE"],
    ["profile", "@alice:example.org", ""],
    [null, "@alice:example.org", "DEVICE"],
    ["profile", 42, "DEVICE"],
    ["profile", "@alice:example.org", undefined],
  ])(
    "rejects malformed identity components: %p, %p, %p",
    async (serverProfileId, matrixUserId, matrixDeviceId) => {
      await expect(
        new ActorIdFactory().create(
          serverProfileId,
          matrixUserId,
          matrixDeviceId
        )
      ).rejects.toThrow("Invalid");
    }
  );

  it("keeps adjacent fields distinct by using NUL delimiters", async () => {
    const factory = new ActorIdFactory();
    const [left, right] = await Promise.all([
      factory.create("ab", "c", "device"),
      factory.create("a", "bc", "device"),
    ]);

    expect(left).not.toBe(right);
  });
});

describe("AutomergeWorkspaceDocument", () => {
  it("uses one deterministic genesis across runtime actors and keeps ordinary changes on those actors", () => {
    const left = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("bb")
    );
    const right = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("cc")
    );

    expect(left.heads()).toEqual(right.heads());
    expect(left.save()).toEqual(right.save());
    const genesis = Automerge.decodeChange(
      Automerge.getAllChanges(Automerge.load<WorkspaceState>(left.save()))[0]
    );
    expect(genesis.actor).toBe(WORKSPACE_GENESIS_ACTOR_ID);
    const genesisHeads = left.heads();

    const leftChange = firstChange(
      left.change("left runtime actor", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );
    const rightChange = firstChange(
      right.change("right runtime actor", (draft) => {
        draft.tasks.task.completion = "completed";
      })
    );
    expect(Automerge.decodeChange(leftChange.bytes).actor).toBe(actor("bb"));
    expect(Automerge.decodeChange(rightChange.bytes).actor).toBe(actor("cc"));
    expect(leftChange.dependencies).toEqual(genesisHeads);
    expect(rightChange.dependencies).toEqual(genesisHeads);

    const mergedLeft = AutomergeWorkspaceDocument.load(
      AutomergeWorkspaceDocument.create(workspaceState(), actor("dd")).save(),
      actor("ee")
    );
    mergedLeft.apply([leftChange, rightChange]);
    const mergedRight = AutomergeWorkspaceDocument.load(
      AutomergeWorkspaceDocument.create(workspaceState(), actor("ff")).save(),
      actor("12")
    );
    mergedRight.apply([rightChange, leftChange]);
    expect(mergedLeft.canonical()).toEqual(mergedRight.canonical());
    expect(mergedLeft.heads()).toEqual(mergedRight.heads());
  });

  it("reserves the protocol genesis actor from runtime mutation use", () => {
    const snapshot = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    ).save();

    expect(() =>
      AutomergeWorkspaceDocument.create(
        workspaceState(),
        WORKSPACE_GENESIS_ACTOR_ID
      )
    ).toThrow("reserved genesis actor");
    expect(() =>
      AutomergeWorkspaceDocument.load(snapshot, WORKSPACE_GENESIS_ACTOR_ID)
    ).toThrow("reserved genesis actor");
  });

  it("converges concurrent scalars and ignores completion without a lifecycle epoch record", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const left = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const right = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));

    const leftChanges = left.change("left", (draft) => {
      draft.tasks.task.category = "FOCUS";
      draft.tasks.task.completion = "active";
    });
    const rightChanges = right.change("right", (draft) => {
      draft.tasks.task.category = "SIMPLE";
      draft.tasks.task.completion = "completed";
    });

    const mergedLR = AutomergeWorkspaceDocument.load(snapshot, actor("dd"));
    mergedLR.apply([...leftChanges, ...rightChanges]);
    const mergedRL = AutomergeWorkspaceDocument.load(snapshot, actor("ee"));
    mergedRL.apply([...rightChanges, ...leftChanges]);

    expect(mergedLR.canonical()).toEqual(mergedRL.canonical());
    expect(mergedLR.canonical().tasks.task.category).toBe("SIMPLE");
    expect(mergedLR.canonical().tasks.task).toMatchObject({
      completion: "active",
      completionEpoch: 0,
    });
    expect([...mergedLR.heads()].sort()).toEqual([...mergedRL.heads()].sort());
  });

  it("merges concurrent disjoint title and note text edits", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const left = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const right = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));

    const leftTitle = left.updateText(["tasks", "task", "title"], "L-task");
    const leftNote = left.updateText(["tasks", "task", "note"], "note-L");
    const rightTitle = right.updateText(["tasks", "task", "title"], "task-R");
    const rightNote = right.updateText(["tasks", "task", "note"], "R-note");

    const merged = AutomergeWorkspaceDocument.load(snapshot, actor("dd"));
    merged.apply([...rightNote, ...leftNote, ...rightTitle, ...leftTitle]);

    expect(merged.canonical().tasks.task.title).toBe("L-task-R");
    expect(merged.canonical().tasks.task.note).toBe("R-note-L");
  });

  it("updates recurrence title text through the same audited text operation", () => {
    const document = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );

    expect(
      document.updateText(
        ["recurrenceTemplates", "recurring", "title"],
        "repeat weekly"
      )
    ).toHaveLength(1);
    expect(document.canonical().recurrenceTemplates.recurring.title).toBe(
      "repeat weekly"
    );
  });

  it.each([
    { path: [] },
    { path: ["tasks"] },
    { path: ["tasks", "missing", "title"] },
    { path: ["tasks", "task", "category"] },
    { path: ["settings", "timezone"] },
    { path: ["recurrenceTemplates", "missing", "note"] },
    { path: ["recurrenceTemplates", "recurring", "rule", "frequency"] },
  ])("fails closed for a non-title/note text path: $path", ({ path }) => {
    const document = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const heads = document.heads();

    expect(() => document.updateText(path, "tampered")).toThrow(
      "Invalid collaborative text path"
    );
    expect(document.heads()).toEqual(heads);
  });

  it.each(["", "a", "ABCDEF", "device-id", "0g", " aa", "aa "])(
    "rejects non-canonical Automerge actor ID %p",
    (invalidActor) => {
      expect(() =>
        AutomergeWorkspaceDocument.create(workspaceState(), invalidActor)
      ).toThrow("Invalid Automerge actor ID");
      expect(() =>
        AutomergeWorkspaceDocument.load(new Uint8Array(), invalidActor)
      ).toThrow("Invalid Automerge actor ID");
    }
  );

  it("creates stable heads independent of wall-clock time", () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    const first = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    now.mockReturnValue(9_999_999_000);
    const second = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    now.mockRestore();

    expect(first.heads()).toEqual(second.heads());
  });

  it("emits deterministic time-zero changes with canonical decoded metadata", () => {
    const first = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const second = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );

    const firstChangeResult = firstChange(
      first.change("edit", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );
    const secondChangeResult = firstChange(
      second.change("edit", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );

    expect(firstChangeResult.hash).toBe(secondChangeResult.hash);
    expect(firstChangeResult.dependencies).toEqual(
      [...firstChangeResult.dependencies].sort()
    );
    expect(firstChangeResult.bytes).toEqual(secondChangeResult.bytes);
  });

  it("returns no binary change and preserves heads for a no-op mutation", () => {
    const document = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const heads = document.heads();

    const changes = document.change("no-op", () => undefined);

    expect(changes).toEqual([]);
    expect(document.heads()).toEqual(heads);
  });

  it("rejects malformed snapshots and binary changes deliberately", () => {
    expect(() =>
      AutomergeWorkspaceDocument.load(new Uint8Array([1, 2, 3]), actor("aa"))
    ).toThrow("Invalid Automerge snapshot");

    const document = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    expect(() =>
      document.apply([
        {
          bytes: new Uint8Array([1, 2, 3]),
          hash: "00".repeat(32),
          dependencies: [],
        },
      ])
    ).toThrow("Invalid Automerge change");
  });

  it("rejects a valid Automerge snapshot with a malformed workspace schema", () => {
    const malformedRoot = Automerge.save(
      Automerge.from({ notAWorkspace: true }, { actor: actor("11") })
    );
    const valid = workspaceState();
    const malformedTask = Automerge.save(
      Automerge.from(
        {
          ...valid,
          tasks: { task: { ...valid.tasks.task, title: 42 } },
        },
        { actor: actor("11") }
      )
    );

    expect(() =>
      AutomergeWorkspaceDocument.load(malformedRoot, actor("aa"))
    ).toThrow("Invalid Automerge snapshot");
    expect(() =>
      AutomergeWorkspaceDocument.load(malformedTask, actor("aa"))
    ).toThrow("Invalid Automerge snapshot");
  });

  it.each([
    {
      name: "missing required nested field",
      mutate: (state: WorkspaceState) => {
        Reflect.deleteProperty(state.tasks.task, "note");
      },
    },
    {
      name: "missing semantic Inbox date field",
      mutate: (state: WorkspaceState) => {
        Reflect.deleteProperty(state.tasks.task, "inboxEnteredOn");
      },
    },
    {
      name: "missing completion epoch field",
      mutate: (state: WorkspaceState) => {
        Reflect.deleteProperty(state.tasks.task, "completionEpoch");
      },
    },
    {
      name: "gapped completion lifecycle",
      mutate: (state: WorkspaceState) => {
        state.completionRecords.gapped = {
          id: "gapped",
          taskId: "task",
          effectiveDate: "2026-07-22",
          kind: "reopened",
          fromCompletionEpoch: 1,
          completionEpoch: 2,
          categoryAtCompletion: null,
          actorId: actor("11"),
          auditTime: "2026-07-22T10:00:00Z",
        };
      },
    },
    {
      name: "missing completion category field",
      mutate: (state: WorkspaceState) => {
        state.completionRecords.complete = {
          id: "complete",
          taskId: "task",
          effectiveDate: "2026-07-22",
          kind: "completed",
          fromCompletionEpoch: 0,
          completionEpoch: 1,
          categoryAtCompletion: "INBOX",
          actorId: actor("11"),
          auditTime: "2026-07-22T10:00:00Z",
        };
        Reflect.deleteProperty(
          state.completionRecords.complete,
          "categoryAtCompletion"
        );
      },
    },
    {
      name: "unknown nested field",
      mutate: (state: WorkspaceState) => {
        Reflect.set(state.tasks.task, "unexpected", true);
      },
    },
    {
      name: "invalid category enum",
      mutate: (state: WorkspaceState) => {
        Reflect.set(state.tasks.task, "category", "DEFERRED");
      },
    },
    {
      name: "array instead of OR-set map",
      mutate: (state: WorkspaceState) => {
        Reflect.set(state.tasks.task.tags, "adds", []);
      },
    },
    {
      name: "fractional recurrence interval",
      mutate: (state: WorkspaceState) => {
        state.recurrenceTemplates.recurring.rule.interval = 1.5;
      },
    },
    {
      name: "out-of-range recurrence weekday",
      mutate: (state: WorkspaceState) => {
        state.recurrenceTemplates.recurring.rule.weekdays = [7];
      },
    },
    {
      name: "invalid calendar date",
      mutate: (state: WorkspaceState) => {
        state.tasks.task.deferredUntil = "2026-02-30";
      },
    },
    {
      name: "invalid IANA timezone",
      mutate: (state: WorkspaceState) => {
        state.settings.timezone = "Mars/Olympus_Mons";
      },
    },
    {
      name: "invalid start-of-day format",
      mutate: (state: WorkspaceState) => {
        state.settings.startOfDay = "4:00";
      },
    },
    {
      name: "invalid audit timestamp",
      mutate: (state: WorkspaceState) => {
        state.tasks.task.created.auditTime = "not-an-instant";
      },
    },
  ])("rejects $name on create and snapshot load", ({ mutate }) => {
    const malformed = workspaceState();
    mutate(malformed);

    expect(() =>
      AutomergeWorkspaceDocument.create(malformed, actor("aa"))
    ).toThrow("Invalid Automerge workspace state");
    expect(() =>
      AutomergeWorkspaceDocument.load(
        rawSnapshot(malformed, actor("11")),
        actor("aa")
      )
    ).toThrow("Invalid Automerge snapshot");
  });

  it("rejects an authentic change that writes title=42 without changing document state", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const invalid = invalidTitleChange(snapshot, actor("bb"));
    const target = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    const before = captureDocument(target);

    expect(() => target.apply([invalid])).toThrow(
      "Quarantined invalid Automerge change"
    );
    expectUnchanged(target, before);
  });

  it("quarantines an honest seq-2 incoming change authored by the reserved genesis actor", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const forged = forgedGenesisActorChange(base.save());
    const decoded = Automerge.decodeChange(forged.bytes);
    const target = AutomergeWorkspaceDocument.load(base.save(), actor("bb"));
    const before = captureDocument(target);

    expect(decoded.actor).toBe(WORKSPACE_GENESIS_ACTOR_ID);
    expect(decoded.seq).toBe(2);
    expect(decoded.hash).toBe(forged.hash);
    expect([...decoded.deps].sort()).toEqual(forged.dependencies);

    let failure: unknown;
    try {
      target.apply([forged]);
    } catch (error: unknown) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(QuarantinedAutomergeChangeError);
    expect(failure).toMatchObject({
      name: "QuarantinedAutomergeChangeError",
      hash: forged.hash,
      reason: "invalid-schema",
      detail: "Reserved Automerge genesis actor cannot author incoming changes",
    });
    expectUnchanged(target, before);
  });

  it("applies no part of a direct batch containing one schema-invalid change", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const validSource = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const valid = firstChange(
      validSource.change("valid", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );
    const invalid = invalidTitleChange(snapshot, actor("cc"));
    const target = AutomergeWorkspaceDocument.load(snapshot, actor("dd"));
    const before = captureDocument(target);

    expect(() => target.apply([valid, invalid])).toThrow(
      "Quarantined invalid Automerge change"
    );
    expectUnchanged(target, before);

    target.apply([valid]);
    expect(target.canonical().tasks.task.category).toBe("FOCUS");
  });

  it("quarantines a pending invalid child atomically when its dependency arrives", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const sourceBeforeParent = Automerge.load<WorkspaceState>(snapshot, {
      actor: actor("bb"),
    });
    const sourceAfterParent = Automerge.change(
      sourceBeforeParent,
      { message: "valid parent", time: 0 },
      (draft) => {
        draft.tasks.task.category = "FOCUS";
      }
    );
    const parent = firstChange(
      binaryChanges(Automerge.getChanges(sourceBeforeParent, sourceAfterParent))
    );
    const sourceAfterChild = Automerge.change(
      sourceAfterParent,
      { message: "invalid child", time: 0 },
      (draft) => {
        Reflect.set(draft.tasks.task, "title", 42);
      }
    );
    const child = firstChange(
      binaryChanges(Automerge.getChanges(sourceAfterParent, sourceAfterChild))
    );
    const target = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    const before = captureDocument(target);

    target.apply([child]);
    expectUnchanged(target, before);

    let failure: unknown;
    try {
      target.apply([parent]);
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(QuarantinedAutomergeChangeError);
    expect(failure).toMatchObject({
      name: "QuarantinedAutomergeChangeError",
      hash: child.hash,
      reason: "invalid-schema",
      detail:
        "Invalid Automerge workspace state at tasks.task.title: Invalid input: expected string, received number",
    });
    expectUnchanged(target, before);

    target.apply([parent]);
    expect(target.canonical().tasks.task.category).toBe("FOCUS");
    expect(target.canonical().tasks.task.title).toBe("task");
    const afterParent = captureDocument(target);

    expect(() => target.apply([child, child])).toThrow(
      "Rejected quarantined Automerge change"
    );
    expectUnchanged(target, afterParent);
  });

  it("rejects changed hash and dependency metadata", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const source = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const change = firstChange(
      source.change("edit", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );

    const wrongHash = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    expect(() =>
      wrongHash.apply([{ ...change, hash: "00".repeat(32) }])
    ).toThrow("Automerge change hash mismatch");

    const wrongDependencies = AutomergeWorkspaceDocument.load(
      snapshot,
      actor("dd")
    );
    expect(() =>
      wrongDependencies.apply([{ ...change, dependencies: ["00".repeat(32)] }])
    ).toThrow("Automerge change dependencies mismatch");
  });

  it("rejects tampered bytes even when the declared metadata is unchanged", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const source = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const change = firstChange(
      source.change("edit", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );
    const tamperedBytes = change.bytes.slice();
    tamperedBytes[tamperedBytes.length - 1] ^= 1;

    const target = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    expect(() => target.apply([{ ...change, bytes: tamperedBytes }])).toThrow(
      /Invalid Automerge change|Automerge change hash mismatch/
    );
  });

  it("requires declared dependencies in canonical order", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const left = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const right = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    const leftChange = firstChange(
      left.change("left", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );
    const rightChange = firstChange(
      right.change("right", (draft) => {
        draft.tasks.task.completion = "completed";
      })
    );
    const source = AutomergeWorkspaceDocument.load(snapshot, actor("dd"));
    source.apply([leftChange, rightChange]);
    const child = firstChange(
      source.change("child", (draft) => {
        draft.tasks.task.deferredUntil = "2026-08-01";
      })
    );

    expect(child.dependencies).toHaveLength(2);
    expect(child.dependencies).toEqual([...child.dependencies].sort());
    const reversed = [...child.dependencies].reverse();
    const target = AutomergeWorkspaceDocument.load(snapshot, actor("ee"));
    expect(() => target.apply([{ ...child, dependencies: reversed }])).toThrow(
      "Automerge change dependencies are not canonical"
    );
  });

  it("queues a valid change with missing dependencies and activates it later", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const source = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const parent = firstChange(
      source.change("parent", (draft) => {
        draft.tasks.task.note = "parent";
      })
    );
    const child = firstChange(
      source.change("child", (draft) => {
        draft.tasks.task.note = "child";
      })
    );
    const target = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    const baseHeads = target.heads();
    const baseSave = target.save();

    target.apply([child]);
    expect(target.heads()).toEqual(baseHeads);
    expect(target.canonical().tasks.task.note).toBe("note");
    expect(target.save()).toEqual(baseSave);

    target.apply([parent]);
    expect(target.canonical().tasks.task.note).toBe("child");
    expect(target.heads()).toEqual(source.heads());
  });

  it("applies duplicate and repeated changes idempotently", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const source = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const change = firstChange(
      source.change("edit", (draft) => {
        draft.tasks.task.category = "FOCUS";
      })
    );
    const target = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));

    target.apply([change, change]);
    const once = target.save();
    const heads = target.heads();
    target.apply([change]);

    expect(target.heads()).toEqual(heads);
    expect(target.save()).toEqual(once);
    expect(target.canonical().tasks.task.category).toBe("FOCUS");
  });

  it("copies state, snapshots, saves, emitted changes, and applied change bytes", () => {
    const input = workspaceState();
    const base = AutomergeWorkspaceDocument.create(input, actor("aa"));
    input.tasks.task.title = "mutated input";
    expect(base.canonical().tasks.task.title).toBe("task");

    const snapshot = base.save();
    const loaded = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    snapshot.fill(0);
    expect(loaded.canonical().tasks.task.title).toBe("task");

    const save = loaded.save();
    save.fill(0);
    expect(loaded.canonical().tasks.task.title).toBe("task");

    const parent = firstChange(
      loaded.change("parent", (draft) => {
        draft.tasks.task.note = "parent";
      })
    );
    const child = firstChange(
      loaded.change("child", (draft) => {
        draft.tasks.task.note = "child";
      })
    );
    const loadedHeads = loaded.heads();
    child.bytes.fill(0);
    expect(loaded.heads()).toEqual(loadedHeads);

    const cleanBase = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const target = AutomergeWorkspaceDocument.load(
      cleanBase.save(),
      actor("cc")
    );
    const childForApply = firstChange(
      AutomergeWorkspaceDocument.load(cleanBase.save(), actor("bb")).change(
        "isolated",
        (draft) => {
          draft.tasks.task.note = "isolated";
        }
      )
    );
    const beforeApply = childForApply.bytes.slice();
    target.apply([childForApply]);
    expect(childForApply.bytes).toEqual(beforeApply);
    childForApply.bytes.fill(0);
    expect(target.canonical().tasks.task.note).toBe("isolated");

    expect(parent.bytes).not.toHaveLength(0);
  });

  it("returns a plain value copy that cannot mutate the live document", () => {
    const document = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const value = document.value();

    value.tasks.task.title = "caller mutation";
    value.settings.timezone = "UTC";

    expect(document.canonical().tasks.task.title).toBe("task");
    expect(document.canonical().settings.timezone).toBe("Europe/Moscow");
  });

  it("preserves audit timestamps as data without using them as conflict clocks", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const snapshot = base.save();
    const lowerActor = AutomergeWorkspaceDocument.load(snapshot, actor("bb"));
    const higherActor = AutomergeWorkspaceDocument.load(snapshot, actor("cc"));
    const lower = lowerActor.change(
      "lower actor with later audit time",
      (draft) => {
        draft.tasks.task.category = "FOCUS";
        draft.tasks.task.created.auditTime = "9999-12-31T23:59:59Z";
      }
    );
    const higher = higherActor.change(
      "higher actor with earlier audit time",
      (draft) => {
        draft.tasks.task.category = "SIMPLE";
        draft.tasks.task.created.auditTime = "1970-01-01T00:00:00Z";
      }
    );
    const merged = AutomergeWorkspaceDocument.load(snapshot, actor("dd"));

    merged.apply([...higher, ...lower]);

    expect(merged.canonical().tasks.task.category).toBe("SIMPLE");
    expect(merged.canonical().tasks.task.created.auditTime).toBe(
      "1970-01-01T00:00:00Z"
    );
  });

  it("reads and changes the exact immutable historical frontier without applying an absolute splice to the merged value", () => {
    const initialState = workspaceState();
    initialState.tasks.task.note = "";
    const base = AutomergeWorkspaceDocument.create(initialState, actor("aa"));
    const common = base.heads();
    const local = AutomergeWorkspaceDocument.load(base.save(), actor("bb"));
    const firstLocal = local.change("first local edit", (draft) => {
      Automerge.splice(draft, ["tasks", "task", "note"], 0, 0, "X");
    });
    const firstLocalHeads = local.heads();
    const remote = AutomergeWorkspaceDocument.load(base.save(), actor("cc"));
    const remoteChanges = remote.change("remote edit", (draft) => {
      Automerge.splice(draft, ["tasks", "task", "note"], 0, 0, "R");
    });

    local.apply(remoteChanges);
    expect(local.value().tasks.task.note).toBe("RX");
    expect(local.valueAt(common).tasks.task.note).toBe("");
    expect(local.valueAt(firstLocalHeads).tasks.task.note).toBe("X");

    const branch = local.changeAt(
      firstLocalHeads,
      actor("dd"),
      "operation:v1:second-local",
      (draft) => {
        Automerge.splice(draft, ["tasks", "task", "note"], 1, 0, "Y");
      }
    );

    expect(branch).toHaveLength(1);
    expect(branch[0]?.dependencies).toEqual(firstLocalHeads);
    expect(local.value().tasks.task.note).toBe("RXY");
    expect(firstLocal).toHaveLength(1);
  });

  it("makes a historical operation actor exactly-once and rejects actor-sequence forks", () => {
    const initialState = workspaceState();
    initialState.tasks.task.note = "";
    const document = AutomergeWorkspaceDocument.create(
      initialState,
      actor("aa")
    );
    const baseHeads = document.heads();
    const operationActor = actor("bb");
    const applyExpectedEdit = (draft: WorkspaceState): void => {
      Automerge.splice(draft, ["tasks", "task", "note"], 0, 0, "X");
    };

    const first = document.changeAt(
      baseHeads,
      operationActor,
      "operation:v1:exact-command-digest",
      applyExpectedEdit
    );
    const retry = document.changeAt(
      baseHeads,
      operationActor,
      "operation:v1:exact-command-digest",
      applyExpectedEdit
    );

    expect(first).toHaveLength(1);
    expect(Automerge.decodeChange(first[0]!.bytes)).toMatchObject({
      actor: operationActor,
      seq: 1,
      deps: [...baseHeads],
      message: "operation:v1:exact-command-digest",
      time: 0,
    });
    expect(retry).toEqual([]);
    expect(document.value().tasks.task.note).toBe("X");
    expect(() =>
      document.changeAt(
        baseHeads,
        operationActor,
        "operation:v1:different-command-digest",
        (draft) => {
          Automerge.splice(draft, ["tasks", "task", "note"], 0, 0, "Y");
        }
      )
    ).toThrow("operation actor");
  });

  it("rejects same operation metadata when the applied Automerge payload differs from the deterministic callback", () => {
    const initialState = workspaceState();
    initialState.tasks.task.note = "";
    const base = AutomergeWorkspaceDocument.create(initialState, actor("aa"));
    const baseHeads = base.heads();
    const operationActor = actor("bb");
    const message = "operation:v1:semantic-command-digest";
    const rawBase = Automerge.load<WorkspaceState>(base.save(), {
      actor: operationActor,
    });
    const forgedResult = Automerge.changeAt(
      rawBase,
      [...baseHeads],
      { message, time: 0 },
      (draft) => {
        Automerge.splice(draft, ["tasks", "task", "note"], 0, 0, "F");
      }
    );
    const forged = firstChange(
      binaryChanges(Automerge.getChanges(rawBase, forgedResult.newDoc))
    );
    const target = AutomergeWorkspaceDocument.load(base.save(), actor("cc"));
    target.apply([forged]);
    const forgedHeads = target.heads();

    expect(() =>
      target.changeAt(baseHeads, operationActor, message, (draft) => {
        Automerge.splice(draft, ["tasks", "task", "note"], 0, 0, "I");
      })
    ).toThrow("payload");
    expect(() =>
      target.changeAt(baseHeads, operationActor, message, () => undefined)
    ).toThrow("payload");
    expect(target.value().tasks.task.note).toBe("F");
    expect(target.heads()).toEqual(forgedHeads);
  });

  it("fails closed for malformed, unavailable, non-frontier, and reserved-actor historical changes", () => {
    const document = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const initialHeads = document.heads();
    document.change("later", (draft) => {
      draft.tasks.task.note = "later";
    });
    const laterHeads = document.heads();

    expect(() => document.valueAt(["not-a-hash"])).toThrow("historical heads");
    expect(() => document.valueAt(["ff".repeat(32)])).toThrow(
      "unavailable historical heads"
    );
    expect(() => document.valueAt([...initialHeads, ...laterHeads])).toThrow(
      "historical frontier"
    );
    expect(() =>
      document.changeAt(
        initialHeads,
        WORKSPACE_GENESIS_ACTOR_ID,
        "operation:v1:reserved",
        () => undefined
      )
    ).toThrow("reserved genesis actor");
  });

  it("rejects a historical operation actor already present in a missing-dependency queue", () => {
    const base = AutomergeWorkspaceDocument.create(
      workspaceState(),
      actor("aa")
    );
    const rawBase = Automerge.load<WorkspaceState>(base.save(), {
      actor: actor("bb"),
    });
    const withParent = Automerge.change(
      rawBase,
      { message: "missing parent", time: 0 },
      (draft) => {
        draft.tasks.task.category = "FOCUS";
      }
    );
    const operationActor = actor("cc");
    const childBase = Automerge.clone(withParent, { actor: operationActor });
    const withPendingChild = Automerge.change(
      childBase,
      { message: "pending operation actor", time: 0 },
      (draft) => {
        draft.tasks.task.note = "pending";
      }
    );
    const pendingChild = firstChange(
      binaryChanges(Automerge.getChanges(withParent, withPendingChild))
    );
    const target = AutomergeWorkspaceDocument.load(base.save(), actor("dd"));
    target.apply([pendingChild]);

    expect(() =>
      target.changeAt(
        base.heads(),
        operationActor,
        "operation:v1:local-collision",
        (draft) => {
          draft.tasks.task.note = "local";
        }
      )
    ).toThrow("pending operation actor");
  });
});
