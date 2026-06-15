import type { BiasMode } from '../../../data/galaxyCatalog/biasMode';

/**
 * EngineBiasHandle — Malmquist-bias correction controls.
 *
 * Two user-facing knobs.  `setMode` kicks an async per-galaxy bake on the
 * renderer when transitioning between modes (handled in the bespoke setter,
 * not via settingsTable — see settingsTable.ts module doc).  `setAbsMagLimit`
 * tunes the threshold the volume-limited mode uses.
 *
 * The bake-derived parameters (`apparentMagLimit`, `schechterMStar`,
 * `schechterAlpha`) are NOT user-tunable — they live on `EngineState.bias`
 * as internal bake state.
 */
export type EngineBiasHandle = {
  /** Set the Malmquist-bias correction mode. */
  setMode: (mode: BiasMode) => void;
  /** Set the absolute-magnitude threshold for `BiasMode.VolumeLimited`. */
  setAbsMagLimit: (absMag: number) => void;
};
