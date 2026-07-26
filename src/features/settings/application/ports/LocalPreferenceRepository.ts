/** Device-local preferences that must never enter the synchronized document. */
export interface LocalPreferenceRepository {
  get(workspaceId: string, key: string): string | null;
  set(workspaceId: string, key: string, value: string): void;
  remove(workspaceId: string, key: string): void;
}
