import type { AsteroidTuning } from './AsteroidTuning';

/** The numeric knobs of `AsteroidTuning`, each a slider row; the colours are picker rows. */
export type AsteroidTuningSliderKey = Exclude<keyof AsteroidTuning, 'colors'>;
