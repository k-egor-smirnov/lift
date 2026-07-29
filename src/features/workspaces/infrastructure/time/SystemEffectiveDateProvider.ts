import type { EffectiveDateProvider } from "../../application/ports/EffectiveDateProvider";
import type { EffectiveDateClock } from "../../application/ports/EffectiveDateClock";
import { effectiveDate } from "../../domain/EffectiveDate";
import type { WorkspaceState } from "../../domain/WorkspaceState";

/** System-clock adapter for the pure effective-date projection. */
export class SystemEffectiveDateProvider implements EffectiveDateProvider {
  constructor(private readonly clock: EffectiveDateClock) {}

  current(settings: Readonly<WorkspaceState["settings"]>): string {
    return effectiveDate(
      this.clock.now(),
      settings.timezone,
      settings.startOfDay
    );
  }
}
