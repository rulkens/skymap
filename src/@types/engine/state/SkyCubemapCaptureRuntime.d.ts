/**
 * SkyCubemapCaptureRuntime — cross-frame memory for the black-hole lens's
 * one-shot sky-cubemap bake. Lives on `cameraRuntime` alongside its sibling
 * amortized-Resources fields; single-writer: only `renderFrame` reads or
 * writes it.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';

export type SkyCubemapCaptureRuntime = {
  /**
   * The lensing band's state as of the last rendered frame. `renderFrame`
   * reads it for the `bandJustEngaged` edge before overwriting it, and the
   * `sky-cubemap` render-target row's `allocateWhen` reads it to decide
   * whether its texture exists at all (`renderTargets.ts`).
   */
  bandActive: boolean;
  /**
   * The camera's distance from the galactic-centre anchor as of the last
   * rendered frame, Mpc — updated every frame regardless of `bandActive`.
   * The `sky-cubemap` row's `allocateWhen` reads it to decide whether an
   * already-allocated row should survive a bit past band close (hysteresis
   * margin — see `renderTargets.ts`).
   */
  gcDistanceMpc: number;
  /**
   * The settings slice reference the cubemap's contents were baked under.
   * `null` = nothing usable baked: never baked, the band just closed, or the
   * last bake ran while the roster was still settling.
   */
  bakedSettings: EngineSettingsState | null;
};
