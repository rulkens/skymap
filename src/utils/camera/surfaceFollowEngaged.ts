/**
 * surfaceFollowEngaged — hysteresis gate for surface-fixed camera follow
 * (spec §4.6): engage once the camera drops to a focused body's engage
 * altitude, disengage only once it has pulled back out past a HIGHER
 * disengage altitude. A single threshold would flicker the mode every frame
 * for a camera parked exactly at the switch point (scroll noise, hand
 * jitter); the two-threshold band absorbs that.
 *
 * Pure boolean state machine — no altitude→Mpc resolution here. The caller
 * (`runFrame`'s basis-resolution block) resolves `engageAtMpc` /
 * `disengageAtMpc` from on-screen ground-drift rate (spec §4.6) — fixed
 * absolute altitudes shared by every focused body, not the body's own radius.
 */

export function surfaceFollowEngaged(
  wasEngaged: boolean,
  altitudeMpc: number,
  engageAtMpc: number,
  disengageAtMpc: number,
): boolean {
  if (!wasEngaged && altitudeMpc <= engageAtMpc) return true;
  if (wasEngaged && altitudeMpc >= disengageAtMpc) return false;
  return wasEngaged;
}
