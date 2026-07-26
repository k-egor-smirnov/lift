import { describe, expect, it } from "vitest";

import { minimalTextSplice } from "../minimalTextSplice";

describe("minimalTextSplice", () => {
  it.each([
    ["Task", "Tasks", { index: 4, deleteCount: 0, insert: "s" }],
    ["Tasks", "Task", { index: 4, deleteCount: 1, insert: "" }],
    ["cold task", "bold task", { index: 0, deleteCount: 1, insert: "b" }],
  ])(
    "computes one minimal UTF-16 splice from %s to %s",
    (before, after, expected) => {
      expect(minimalTextSplice(before, after)).toEqual(expected);
    }
  );

  it("returns null when text is unchanged", () => {
    expect(minimalTextSplice("same", "same")).toBeNull();
  });

  it("never splits a surrogate pair when replacing an emoji", () => {
    expect(minimalTextSplice("A😀B", "A😃B")).toEqual({
      index: 1,
      deleteCount: 2,
      insert: "😃",
    });
  });

  it("rejects ill-formed inserted UTF-16 text", () => {
    expect(() => minimalTextSplice("ok", `ok\ud800`)).toThrow(
      "ill-formed UTF-16"
    );
  });
});
