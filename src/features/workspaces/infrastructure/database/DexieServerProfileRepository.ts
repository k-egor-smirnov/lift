import type {
  ActiveServerTarget,
  ServerProfileRepository,
} from "../../application/ports/ServerProfileRepository";
import { ServerProfile } from "../../domain/ServerProfile";
import type { LiftSecureDatabase } from "./LiftSecureDatabase";

export class ServerProfileInUseError extends Error {
  constructor(profileId: string) {
    super(`Server profile ${profileId} is referenced by an attached target`);
    this.name = "ServerProfileInUseError";
  }
}

export class DexieServerProfileRepository implements ServerProfileRepository {
  constructor(private readonly database: LiftSecureDatabase) {}

  async save(profile: ServerProfile): Promise<void> {
    const existing = await this.database.serverProfiles.get(profile.id);
    await this.database.serverProfiles.put({
      ...existing,
      id: profile.id,
      name: profile.name,
      baseUrl: profile.baseUrl,
    });
  }

  async get(id: string): Promise<ServerProfile | undefined> {
    const record = await this.database.serverProfiles.get(id);
    return record === undefined ? undefined : ServerProfile.create(record);
  }

  async list(): Promise<readonly ServerProfile[]> {
    const records = await this.database.serverProfiles.orderBy("id").toArray();
    return records.map((record) => ServerProfile.create(record));
  }

  async delete(id: string): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.serverProfiles, this.database.syncTargets],
      async () => {
        const attached = await this.database.syncTargets
          .where("serverProfileId")
          .equals(id)
          .and(
            (target) =>
              target.state !== "retired" &&
              (target.mode === "active" || target.mode === "read-only")
          )
          .first();
        if (attached !== undefined) throw new ServerProfileInUseError(id);
        await this.database.serverProfiles.delete(id);
      }
    );
  }

  async getActiveTarget(
    workspaceId: string
  ): Promise<ActiveServerTarget | undefined> {
    const target = await this.database.syncTargets
      .where("workspaceId")
      .equals(workspaceId)
      .and(
        (candidate) =>
          candidate.state === "active" &&
          (candidate.mode === "active" || candidate.mode === "read-only")
      )
      .first();
    if (target === undefined || target.mode === "candidate") return undefined;
    return {
      id: target.id,
      workspaceId: target.workspaceId,
      serverProfileId: target.serverProfileId,
      roomId: target.roomId,
      mode: target.mode,
    };
  }

  async activateTarget(workspaceId: string, targetId: string): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.serverProfiles, this.database.syncTargets],
      async () => {
        const candidates = await this.database.syncTargets
          .where("workspaceId")
          .equals(workspaceId)
          .toArray();
        const selected = candidates.find((target) => target.id === targetId);
        if (
          selected === undefined ||
          selected.state === "retired" ||
          (await this.database.serverProfiles.get(selected.serverProfileId)) ===
            undefined
        ) {
          throw new Error("Target is not attachable");
        }
        await Promise.all(
          candidates.map((target) =>
            this.database.syncTargets.update(target.id, {
              mode: target.id === targetId ? "active" : "candidate",
              state: target.id === targetId ? "active" : target.state,
              updatedAt: Date.now(),
            })
          )
        );
      }
    );
  }
}
