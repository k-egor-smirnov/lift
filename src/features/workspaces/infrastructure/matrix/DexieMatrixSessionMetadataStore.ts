import type { LiftSecureDatabase } from "../database/LiftSecureDatabase";

export interface MatrixSessionMetadataStore {
  persist(profileId: string, userId: string, deviceId: string): Promise<void>;
  clear(profileId: string): Promise<void>;
  latest(): Promise<{
    readonly profileId: string;
    readonly userId: string;
    readonly deviceId: string;
  } | null>;
}

export class DexieMatrixSessionMetadataStore implements MatrixSessionMetadataStore {
  constructor(
    private readonly database: LiftSecureDatabase,
    private readonly now: () => number = () => Date.now()
  ) {}

  async persist(
    profileId: string,
    userId: string,
    deviceId: string
  ): Promise<void> {
    const changed = await this.database.serverProfiles.update(profileId, {
      sessionUserId: userId,
      sessionDeviceId: deviceId,
      sessionUpdatedAt: this.now(),
    });
    if (changed !== 1) throw new Error("Matrix server profile is missing");
  }

  async latest(): Promise<{
    readonly profileId: string;
    readonly userId: string;
    readonly deviceId: string;
  } | null> {
    const rows = await this.database.serverProfiles
      .filter(
        (profile) =>
          profile.sessionUserId !== undefined &&
          profile.sessionDeviceId !== undefined &&
          profile.sessionUpdatedAt !== undefined
      )
      .toArray();
    const latest = rows.sort(
      (left, right) =>
        (right.sessionUpdatedAt ?? 0) - (left.sessionUpdatedAt ?? 0)
    )[0];
    return latest?.sessionUserId === undefined ||
      latest.sessionDeviceId === undefined
      ? null
      : {
          profileId: latest.id,
          userId: latest.sessionUserId,
          deviceId: latest.sessionDeviceId,
        };
  }

  async clear(profileId: string): Promise<void> {
    await this.database.serverProfiles.update(profileId, {
      sessionUserId: undefined,
      sessionDeviceId: undefined,
      sessionUpdatedAt: undefined,
    });
  }
}
