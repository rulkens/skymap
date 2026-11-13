import type { SliderField } from '../../../../@types/data/SliderField';
import type { SatelliteTuningSliderKey } from '../../@types/SatelliteTuningSliderKey';

/** The satellite tuning section's slider rows; the colours are picker rows, not sliders. */
export const SATELLITE_TUNING_SLIDER_FIELDS: readonly SliderField<SatelliteTuningSliderKey>[] = [
  {
    key: 'ambient',
    label: 'Ambient',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Light every satellite gets, sunlit or in shadow',
  },
  {
    // Far past the physical look on purpose: large dots turn the field into a diagram.
    key: 'dotRadiusPx',
    label: 'Dot size',
    min: 0.5,
    max: 30,
    step: 0.5,
    format: (v) => `${v.toFixed(1)} px`,
    title: 'Half-width of a satellite dot on screen; glints grow from it',
  },
];
