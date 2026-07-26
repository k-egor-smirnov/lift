import type { DateOnly } from "../../../../shared/domain/value-objects/DateOnly";

/** Workspace-timezone-aware date boundary supplied by the composition root. */
export interface OnboardingDateContext {
  current(): Promise<DateOnly>;
  isAfterStartOfDay(): Promise<boolean>;
}
