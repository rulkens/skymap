/** The Eased focus move's one knob. Seconds on screen; the component converts to the ms the store holds. */

import type { SliderField } from '../../@types/data/SliderField';

export const EASED_SLIDER_FIELDS: readonly SliderField<'easedS'>[] = [
  {
    key: 'easedS',
    label: 'eased duration',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (s) => `${s.toFixed(2)} s`,
    title:
      'Duration of an Eased focus move. Also drives Home and the planet approach, under either style.',
  },
];
