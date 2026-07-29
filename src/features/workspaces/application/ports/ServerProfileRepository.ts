import type { ServerProfile } from "../../domain/ServerProfile";

export interface ActiveServerTarget {
  readonly id: string;
  readonly workspaceId: string;
  readonly serverProfileId: string;
  readonly roomId: string;
  readonly mode: "active" | "read-only";
}

export interface ServerProfileRepository {
  save(profile: ServerProfile): Promise<void>;
  get(id: string): Promise<ServerProfile | undefined>;
  list(): Promise<readonly ServerProfile[]>;
  delete(id: string): Promise<void>;
  getActiveTarget(workspaceId: string): Promise<ActiveServerTarget | undefined>;
  activateTarget(workspaceId: string, targetId: string): Promise<void>;
}
