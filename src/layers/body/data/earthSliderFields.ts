import type { SliderField } from '../../../@types/data/SliderField';
import type { EarthSettings } from '../../../@types/settings/EarthSettings';

/** The Earth tuning knobs shown in the DebugPanel. */
export const EARTH_SLIDER_FIELDS: readonly SliderField<keyof EarthSettings>[] = [
  {
    key: 'atmosphereExposure',
    label: 'Atmosphere exposure',
    min: 0,
    max: 4,
    step: 0.05,
    format: (value) => value.toFixed(2),
  },
  {
    key: 'ambientLight',
    label: 'Ambient light',
    min: 0,
    max: 0.2,
    step: 0.005,
    format: (value) => value.toFixed(3),
  },
  {
    key: 'oceanRoughness',
    label: 'Ocean roughness',
    min: 0.02,
    max: 0.6,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
];
