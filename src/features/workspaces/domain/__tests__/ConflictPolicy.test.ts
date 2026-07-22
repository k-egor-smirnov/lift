import {
  compareOpIds,
  comparePositions,
  isDeleted,
  resolveCompletion,
  resolveScalar,
} from "../ConflictPolicy";

describe("scalar conflict policy", () => {
  it("uses completed for a true Automerge conflict and canonical op IDs for scalars", () => {
    expect(resolveCompletion({ "2@aa": "active", "1@bb": "completed" })).toBe(
      "completed"
    );
    expect(resolveScalar({ "9@aa": "FOCUS", "2@ff": "SIMPLE" }).value).toBe(
      "SIMPLE"
    );
  });

  it("returns a singleton completion assignment as-is", () => {
    expect(resolveCompletion({ "1@zz": "active" })).toBe("active");
    expect(resolveCompletion({ "1@zz": "completed" })).toBe("completed");
  });

  it("returns active when every true concurrent assignment is active", () => {
    expect(resolveCompletion({ "5@aa": "active", "1@bb": "active" })).toBe(
      "active"
    );
  });

  it("sorts scalar alternatives by actor code units first and counter second", () => {
    const resolution = resolveScalar({
      "10@aa": "aa-10",
      "2@b": "b-2",
      "2@aa": "aa-2",
      "1@A": "A-1",
    });

    expect(resolution).toEqual({
      value: "b-2",
      winnerOpId: "2@b",
      alternatives: [
        { opId: "1@A", value: "A-1" },
        { opId: "2@aa", value: "aa-2" },
        { opId: "10@aa", value: "aa-10" },
        { opId: "2@b", value: "b-2" },
      ],
    });
  });

  it("is independent of conflict-map insertion order", () => {
    const forward = resolveScalar(
      Object.fromEntries([
        ["2@bb", "second"],
        ["1@aa", "first"],
        ["3@aa", "third"],
      ])
    );
    const reverse = resolveScalar(
      Object.fromEntries([
        ["3@aa", "third"],
        ["1@aa", "first"],
        ["2@bb", "second"],
      ])
    );

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });

  it.each([
    "",
    "1",
    "@actor",
    "1@",
    "-1@actor",
    "+1@actor",
    "01@actor",
    "1.0@actor",
    " 1@actor",
    "1@   ",
  ])("rejects malformed or non-canonical Automerge op ID %p", (opId) => {
    expect(() => compareOpIds(opId, "1@valid")).toThrow(
      "Invalid Automerge op id"
    );
    expect(() => resolveScalar({ [opId]: "value" })).toThrow(
      "Invalid Automerge op id"
    );
  });

  it("rejects an empty scalar conflict set", () => {
    expect(() => resolveScalar({})).toThrow("Scalar conflict set is empty");
    expect(() => resolveCompletion({})).toThrow(
      "Completion conflict set is empty"
    );
  });
});

describe("lifecycle and position policies", () => {
  it("uses delete-wins whenever any deletion dot exists", () => {
    expect(isDeleted({})).toBe(false);
    expect(isDeleted({ "1@aa": true })).toBe(true);
    expect(isDeleted({ "1@aa": true, "2@bb": true })).toBe(true);
  });

  it("orders positions by key, actorId, then taskId using code-unit order", () => {
    const positions = [
      { key: "a", actorId: "aa", taskId: "task-b" },
      { key: "A", actorId: "zz", taskId: "task-z" },
      { key: "a", actorId: "b", taskId: "task-a" },
      { key: "a", actorId: "aa", taskId: "task-a" },
    ];

    expect([...positions].sort(comparePositions)).toEqual([
      { key: "A", actorId: "zz", taskId: "task-z" },
      { key: "a", actorId: "aa", taskId: "task-a" },
      { key: "a", actorId: "aa", taskId: "task-b" },
      { key: "a", actorId: "b", taskId: "task-a" },
    ]);
  });

  it.each([
    [{ key: "", actorId: "aa", taskId: "task-1" }],
    [{ key: "a", actorId: "", taskId: "task-1" }],
    [{ key: "a", actorId: "aa", taskId: "" }],
  ])("rejects empty position identifiers", (position) => {
    expect(() =>
      comparePositions(position, { key: "b", actorId: "bb", taskId: "task-2" })
    ).toThrow("non-empty");
  });
});
