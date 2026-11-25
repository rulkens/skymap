import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';
import type { ViewSlice } from '../../../../../@types/view/ViewSlice';

export const GALAXIES_SLIDER_FIELDS: readonly SliderRowField<keyof ViewSlice['galaxies']>[] = [
  {
    key: 'intensity',
    label: 'intensity',
    min: 0.05,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: 'Brightness of each catalog dot, before its own mass weighting.',
  },
  {
    key: 'pointSizePx',
    label: 'point size (px)',
    min: 0.5,
    max: 8,
    step: 0.5,
    format: (v) => v.toFixed(1),
    title: 'Screen-space dot radius — constant with distance, so far galaxies stay visible.',
  },
];
