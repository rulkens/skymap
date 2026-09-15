/**
 * CubemapCaptureRuntime — cross-frame memory for ONE `CUBEMAP_CAPTURES` row's
 * bake. Single-writer: only `scheduleCubemapCaptures` writes it, only the row's
 * `allocateWhen` (`renderTargets.ts`) reads it.
 *
 * Both `last…` fields are LAST-frame values, not live ones: `allocateWhen` runs
 * inside `runFrame`'s reconcile, before this frame's pose and body states
 * exist, so the previous frame is all it can see.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';

export type CubemapCaptureRuntime = {
  /** Whether the row's band was open. */
  lastBandActive: boolean;
  /** Camera distance from the row's anchor, Mpc. */
  lastAnchorDistanceMpc: number;
  /**
   * The settings slice reference the faces were baked under. `null` = nothing
   * usable baked: never baked, the band just closed, or the last bake ran while
   * the roster was still settling.
   */
  bakedSettings: EngineSettingsState | null;
  /** The row's own memory of `state.contentVersion` at its last bake; same null sentinel. */
  bakedContentVersion: number | null;
};
