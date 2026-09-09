/**
 * SkyCubemapCaptureRuntime — cross-frame memory for the black-hole lens's
 * one-shot sky-cubemap bake. A top-level `EngineState` field; single-writer:
 * only `renderFrame` writes it, and only `renderTargets.ts` reads it.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';

export type SkyCubemapCaptureRuntime = {
  /**
   * Whether the lensing band was open as of the last rendered frame.
   * `renderFrame` reads it for the `bandJustEngaged` edge before overwriting
   * it, and the `sky-cubemap` render-target row's `allocateWhen` reads it to
   * decide whether its texture exists at all (`renderTargets.ts`). Last-frame
   * memory rather than a live value because `allocateWhen` runs inside
   * `runFrame`'s reconcile, before this frame's pose and body states exist —
   * the previous frame is all it can see.
   */
  lastBandActive: boolean;
  /**
   * The camera's distance from the galactic-centre anchor as of the last
   * rendered frame, Mpc — recorded every frame regardless of the band. The
   * `sky-cubemap` row's `allocateWhen` reads it to decide whether an
   * already-allocated row should survive a bit past band close (hysteresis
   * margin — see `renderTargets.ts`); same last-frame reason as above.
   */
  lastGcDistanceMpc: number;
  /**
   * The settings slice reference the cubemap's contents were baked under.
   * `null` = nothing usable baked: never baked, the band just closed, or the
   * last bake ran while the roster was still settling.
   */
  bakedSettings: EngineSettingsState | null;
};
