import type { WorkspaceState } from "../../domain/WorkspaceState";

export type WorkspaceDateSettings = Readonly<WorkspaceState["settings"]>;

/** Projects the current semantic workspace date without mutating state. */
export interface EffectiveDateProvider {
  current(settings: WorkspaceDateSettings): string;
}
