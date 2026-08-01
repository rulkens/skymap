/**
 * GalaxyFieldArmRecord — one arm's personality/meander/clump/wave lanes, read
 * back out of `gen.armTable` (`generationUboLayout.ts`'s `armTable` array) in
 * the exact field order `generate.wesl`'s `armStarSample` consumes them.
 */
export type GalaxyFieldArmRecord = {
  readonly phase: number;
  readonly pitch: number;
  readonly weight: number;
  readonly fadeRadius: number;
  readonly meanderAmp: number;
  readonly meanderFreq: number;
  readonly meanderPhase: number;
  readonly clumpF1: number;
  readonly clumpP1: number;
  readonly clumpF2: number;
  readonly clumpP2: number;
  readonly waveF1: number;
  readonly waveP1: number;
  readonly waveF2: number;
  readonly waveP2: number;
};
