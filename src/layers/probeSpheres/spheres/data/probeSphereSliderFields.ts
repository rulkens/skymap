import type { SliderField } from '../../../../@types/data/SliderField';

export const PROBE_SPHERE_SLIDER_FIELDS: readonly SliderField<'metallic' | 'roughness'>[] = [
  {
    key: 'metallic',
    label: 'Metalness',
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
  {
    key: 'roughness',
    label: 'Roughness',
    min: 0,
    max: 1,
    step: 0.01,
    format: (value) => value.toFixed(2),
  },
];
