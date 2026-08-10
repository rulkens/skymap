/**
 * GalaxyFieldArmRecord — one arm's personality/meander/clump/wave lanes, read
 * back out of `gen.armTable` (`generationUboLayout.ts`'s `armTable` array) in
 * the exact field order `generate.wesl`'s `armStarSample` consumes them.
 *
 * `age` (lane 7) is the one field the sprite shader does NOT consume: it
 * exists for the analytic field's contrast law (`pushArmRidges` in
 * `galaxyFieldMixture.ts`), 0 = young gas arm, 1 = old stellar arm.
 */
export type GalaxyFieldArmRecord = {
  readonly phase: number;
  readonly pitch: number;
  readonly weight: number;
  readonly fadeRadius: number;
  /**
   * Log-radius (armRidgeAngle's `logR`, 0 at `armStartRadius`) where THIS
   * arm's rendered span begins — an ordinary arm's is
   * `log(ARM_SPAN_START_FRAC)` (`armRidgeGeometry.ts`). A spur
   * (`armSpurGeometry.ts`) sets its own: the log-radius of the root it grows
   * from on its parent, not the galaxy-wide default. Not read by
   * `armStarSample` — v1 has no spurs.
   */
  readonly spanStartLogR: number;
  readonly meanderAmp: number;
  readonly meanderFreq: number;
  readonly meanderPhase: number;
  /** [0,1]; 0 = young gas arm, 1 = old stellar arm. Not read by `armStarSample`. */
  readonly age: number;
  readonly clumpF1: number;
  readonly clumpP1: number;
  readonly clumpF2: number;
  readonly clumpP2: number;
  readonly waveF1: number;
  readonly waveP1: number;
  readonly waveF2: number;
  readonly waveP2: number;
};
