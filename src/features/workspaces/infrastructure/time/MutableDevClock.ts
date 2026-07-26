import type { EffectiveDateClock } from "../../application/ports/EffectiveDateClock";

/** In-memory clock for deterministic development and test date transitions. */
export class MutableDevClock implements EffectiveDateClock {
  private value: Date;

  constructor(initialValue: Date) {
    this.value = new Date(initialValue.getTime());
  }

  now(): Date {
    return new Date(this.value.getTime());
  }

  set(value: Date): void {
    this.value = new Date(value.getTime());
  }

  advanceDays(days: number): void {
    if (!Number.isSafeInteger(days)) {
      throw new Error("Clock day delta must be a safe integer");
    }
    this.value = new Date(this.value.getTime() + days * 86_400_000);
  }
}
