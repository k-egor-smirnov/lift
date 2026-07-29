/** Clock boundary used only to evaluate a workspace's effective date. */
export interface EffectiveDateClock {
  now(): Date;
}
