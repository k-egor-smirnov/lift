import type { MatrixSessionMetadataStore } from "./DexieMatrixSessionMetadataStore";

interface MatrixSessionMetadata {
  readonly profileId: string;
  readonly userId: string;
  readonly deviceId: string;
}

/**
 * Stages a second Matrix login without changing the durable active-session
 * pointer. The migration coordinator promotes it atomically with syncTargets.
 */
export class InMemoryMatrixSessionMetadataStore implements MatrixSessionMetadataStore {
  private value: MatrixSessionMetadata | null = null;

  async persist(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<void> {
    this.value = { profileId, userId, deviceId };
  }

  async clear(profileId: string): Promise<void> {
    if (this.value?.profileId === profileId) this.value = null;
  }

  async latest(): Promise<MatrixSessionMetadata | null> {
    return this.value === null ? null : { ...this.value };
  }
}
