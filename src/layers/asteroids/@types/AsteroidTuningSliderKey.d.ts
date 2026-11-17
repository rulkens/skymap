import type { AsteroidTuning } from './AsteroidTuning';

/** The numeric global knobs of `AsteroidTuning`, each a slider row; the ramp is picker rows, the modes dropdowns. */
export type AsteroidTuningSliderKey = Exclude<
  keyof AsteroidTuning,
  'perClass' | 'beltRamp' | 'colorBy' | 'sizeBy'
>;
