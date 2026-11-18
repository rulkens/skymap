/** The film grade's knobs for the DebugPanel board; ranges are the spec's slider table. */

import type { SliderField } from '../../@types/data/SliderField';
import type { FilmGrade } from '../../@types/settings/FilmGrade';

const two = (v: number): string => v.toFixed(2);
const three = (v: number): string => v.toFixed(3);
const one = (v: number): string => v.toFixed(1);

export const FILM_GRADE_SLIDER_FIELDS: readonly SliderField<keyof FilmGrade>[] = [
  { key: 'contrast', label: 'Contrast', min: 0.8, max: 1.6, step: 0.01, format: two },
  { key: 'lift', label: 'Black lift', min: 0, max: 0.1, step: 0.002, format: three },
  { key: 'splitTone', label: 'Split tone', min: 0, max: 1, step: 0.01, format: two },
  { key: 'grain', label: 'Grain', min: 0, max: 0.2, step: 0.005, format: three },
  { key: 'grainSizePx', label: 'Grain size px', min: 1, max: 6, step: 0.1, format: one },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, format: two },
  { key: 'chromaticPx', label: 'Chromatic px', min: 0, max: 30, step: 0.1, format: one },
  { key: 'softnessPx', label: 'Edge softness px', min: 0, max: 20, step: 0.1, format: one },
  { key: 'squeeze', label: 'Anamorphic squeeze', min: 1, max: 2, step: 0.05, format: two },
];
