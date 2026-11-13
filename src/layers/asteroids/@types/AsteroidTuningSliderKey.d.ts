import type { AsteroidTuning } from './AsteroidTuning';

/** The numeric knobs of `AsteroidTuning`, each a slider row; the colours are picker rows, the modes dropdowns. */
export type AsteroidTuningSliderKey = Exclude<
  keyof AsteroidTuning,
  'colors' | 'beltRamp' | 'colorBy' | 'sizeBy'
>;
