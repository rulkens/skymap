import { CLASS_FEATURES } from '../../../../content/pages/classroom/classFeatures.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

export const LESSON_MINUTES = CLASS_FEATURES.reduce((sum, part) => sum + part.minutes, 0);
// The minute each part starts at, for the bar's ticks.
export const STARTS = CLASS_FEATURES.map((_, at) =>
  CLASS_FEATURES.slice(0, at).reduce((sum, part) => sum + part.minutes, 0),
);
export const SIZES = narrowSizes('100vw', 'min(calc(50vw - 4rem), 36rem)');
