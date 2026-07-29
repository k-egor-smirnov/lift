import { describe, expect, it } from "vitest";

import { BrowserLocalPreferenceRepository } from "../BrowserLocalPreferenceRepository";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("BrowserLocalPreferenceRepository", () => {
  it("isolates acknowledgements by workspace and effective date", () => {
    const storage = new MemoryStorage();
    const repository = new BrowserLocalPreferenceRepository(storage);

    repository.set("workspace-a", "daily-modal:2026-07-22", "shown");

    expect(repository.get("workspace-a", "daily-modal:2026-07-22")).toBe(
      "shown"
    );
    expect(repository.get("workspace-a", "daily-modal:2026-07-23")).toBeNull();
    expect(repository.get("workspace-b", "daily-modal:2026-07-22")).toBeNull();
  });
});
