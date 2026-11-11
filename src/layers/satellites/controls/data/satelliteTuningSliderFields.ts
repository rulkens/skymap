import type { SliderField } from '../../../../@types/data/SliderField';

/** The satellite tuning section's slider rows; the colours are picker rows, not sliders. */
export const SATELLITE_TUNING_SLIDER_FIELDS: readonly SliderField<'ambient'>[] = [
  {
    key: 'ambient',
    label: 'Ambient',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Light every satellite gets, sunlit or in shadow',
  },
];
