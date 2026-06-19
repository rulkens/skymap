import type { BiasMode } from '../../../data/galaxyCatalog/biasMode';

/**
 * EngineBiasHandle — Malmquist-bias correction controls.
 *
 * `setMode` kicks an async per-galaxy bake on the renderer when transitioning
 * between modes.  The bake-derived per-galaxy weights are NOT user-tunable and
 * never pass through engine state: `biasCorrectionSubsystem` splices them
 * straight into the per-vertex buffer (`schechterRatio` + angular slots) after
 * each bake.
 */
export type EngineBiasHandle = {
  /** Set the Malmquist-bias correction mode. */
  setMode: (mode: BiasMode) => void;
};
