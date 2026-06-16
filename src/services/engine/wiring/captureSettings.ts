/**
 * captureSettings — take a detached snapshot of the six tour-owned
 * settings clusters off the live engine state.
 *
 * The cinematic tour captures the user's settings, plays an effect that
 * mutates them, then restores the capture. For that round-trip to be
 * sound the capture must be fully *detached* from `state.settings`: a
 * later mutation of the live settings (a slider drag, an effect step)
 * must not bleed into the snapshot we'll restore from. A shallow copy
 * would share nested cluster objects, so we `structuredClone` a plain
 * object of the six clusters into a deep, independent copy.
 *
 * We clone whole clusters with zero per-field projection: the look-knobs
 * (brightness, intensity, palette, …) ride along with the visibility bits
 * (the `enabled` gates) automatically, so restore is a single
 * cluster-for-cluster assignment with no field-by-field translation to
 * keep in sync.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsSnapshot } from '../../../@types/engine/settings/SettingsSnapshot';

export function captureSettings(state: Pick<EngineState, 'settings'>): SettingsSnapshot {
  const { galaxyCatalogs, structures, volumes, filaments, milkyWay, flow } = state.settings;
  return structuredClone({ galaxyCatalogs, structures, volumes, filaments, milkyWay, flow });
}
