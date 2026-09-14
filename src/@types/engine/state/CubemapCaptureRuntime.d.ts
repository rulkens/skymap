/**
 * CubemapCaptureRuntime — cross-frame memory for ONE `CUBEMAP_CAPTURES` row's
 * bake. Single-writer: only `renderFrame` writes it, only the row's
 * `allocateWhen` (`renderTargets.ts`) reads it.
 *
 * Both `last…` fields are LAST-frame values, not live ones: `allocateWhen` runs
 * inside `runFrame`'s reconcile, before this frame's pose and body states
 * exist, so the previous frame is all it can see.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';

export type CubemapCaptureRuntime = {
  /** Whether the row's band was open as of the last rendered frame. */
  lastBandActive: boolean;
  /**
   * Camera distance from the row's anchor as of the last rendered frame, Mpc.
   * Recorded every frame regardless of the band — the release-margin check
   * needs it on the very frame the band closes, not one frame later.
   */
  lastAnchorDistanceMpc: number;
  /**
   * The settings slice reference the faces were baked under. `null` = nothing
   * usable baked: never baked, the band just closed, or the last bake ran while
   * the roster was still settling.
   */
  bakedSettings: EngineSettingsState | null;
};
