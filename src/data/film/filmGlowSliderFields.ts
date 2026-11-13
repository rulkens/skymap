/** The film glow's knobs for the DebugPanel board; ranges are the spec's slider table. */

import type { SliderField } from '../../@types/data/SliderField';
import type { FilmGlow } from '../../@types/settings/FilmGlow';

const two = (v: number): string => v.toFixed(2);
const one = (v: number): string => v.toFixed(1);

export const FILM_GLOW_SLIDER_FIELDS: readonly SliderField<keyof FilmGlow>[] = [
  { key: 'cap', label: 'Bloom cap', min: 1, max: 50, step: 0.5, format: one },
  { key: 'streakThreshold', label: 'Streak threshold', min: 0, max: 10, step: 0.1, format: one },
  { key: 'streakStrength', label: 'Streak strength', min: 0, max: 3, step: 0.02, format: two },
  { key: 'streakLength', label: 'Streak length', min: 0.25, max: 4, step: 0.05, format: two },
  { key: 'streakTint', label: 'Streak blue', min: 0, max: 1, step: 0.01, format: two },
  { key: 'veil', label: 'Veiling glare', min: 0, max: 2, step: 0.02, format: two },
];
