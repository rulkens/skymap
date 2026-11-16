import type { AsteroidClassLook } from './AsteroidClassLook';

/** The numeric knobs of `AsteroidClassLook`, each a per-class slider row; the tint is a picker row. */
export type AsteroidClassSliderKey = Exclude<keyof AsteroidClassLook, 'color'>;
