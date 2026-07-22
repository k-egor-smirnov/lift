import { describe, expect, it } from "vitest";

import { Sha256OccurrenceIdFactory } from "../Sha256OccurrenceIdFactory";

describe("Sha256OccurrenceIdFactory", () => {
  it.each([
    [
      "template-1",
      "2026-07-22",
      "88c36fb49c3e8f2c1ecb78fdf057c53031d09b82da6298ac6f5176dd3ea218cf",
    ],
    [
      "α-template",
      "2024-02-29",
      "f118f5c9475060b0c493ac4158f8fa030c7df27775d234401311b88fe4ee4bbc",
    ],
    [
      "template-1",
      "1970-01-01",
      "83aae8333a54322db0987d2510ae53ff4b0889b325df4ec0b541ff2bb7f37f71",
    ],
  ])(
    "matches the SHA-256 input vector for %p on %p",
    async (templateId, occurrenceDate, expected) => {
      await expect(
        new Sha256OccurrenceIdFactory().create(templateId, occurrenceDate)
      ).resolves.toBe(expected);
    }
  );

  it("returns the same ID from independent callers", async () => {
    const firstCaller = new Sha256OccurrenceIdFactory();
    const secondCaller = new Sha256OccurrenceIdFactory();

    await expect(
      Promise.all([
        firstCaller.create("template-1", "2026-07-22"),
        secondCaller.create("template-1", "2026-07-22"),
      ])
    ).resolves.toEqual([
      "88c36fb49c3e8f2c1ecb78fdf057c53031d09b82da6298ac6f5176dd3ea218cf",
      "88c36fb49c3e8f2c1ecb78fdf057c53031d09b82da6298ac6f5176dd3ea218cf",
    ]);
  });

  it("uses a NUL delimiter to keep adjacent input fields distinct", async () => {
    const factory = new Sha256OccurrenceIdFactory();

    const left = await factory.create("template", "2026-07-22");
    const right = await factory.create("template\0", "2026-07-22");

    expect(left).not.toBe(right);
  });

  it("returns a stable lowercase 64-character hex digest", async () => {
    const factory = new Sha256OccurrenceIdFactory();

    const first = await factory.create("template-42", "2026-12-31");
    const second = await factory.create("template-42", "2026-12-31");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["", "2026-07-22"],
    ["template-1", ""],
    ["template-1", "2026-02-29"],
    ["template-1", "2026-7-22"],
  ])(
    "rejects invalid occurrence input: %p, %p",
    async (templateId, occurrenceDate) => {
      await expect(
        new Sha256OccurrenceIdFactory().create(templateId, occurrenceDate)
      ).rejects.toThrow();
    }
  );
});
