import type { LocalPreferenceRepository } from "../application/ports/LocalPreferenceRepository";

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class BrowserLocalPreferenceRepository implements LocalPreferenceRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly namespace = "lift-local"
  ) {}

  get(workspaceId: string, key: string): string | null {
    return this.storage.getItem(this.storageKey(workspaceId, key));
  }

  set(workspaceId: string, key: string, value: string): void {
    this.storage.setItem(this.storageKey(workspaceId, key), value);
  }

  remove(workspaceId: string, key: string): void {
    this.storage.removeItem(this.storageKey(workspaceId, key));
  }

  private storageKey(workspaceId: string, key: string): string {
    if (workspaceId.length === 0 || key.length === 0) {
      throw new Error("Local preference scope and key must be non-empty");
    }
    return `${this.namespace}:${encodeURIComponent(workspaceId)}:${encodeURIComponent(key)}`;
  }
}
