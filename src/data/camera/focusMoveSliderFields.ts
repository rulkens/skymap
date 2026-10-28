/** The focus-move knobs, Eased first, then Geodesic. Durations are seconds on screen; the component converts to ms. */

import type { SliderField } from '../../@types/data/SliderField';

export const FOCUS_MOVE_SLIDER_FIELDS: readonly SliderField<
  'easedS' | 'rho' | 'velocity' | 'minS' | 'maxS'
>[] = [
  {
    key: 'easedS',
    label: 'Eased duration',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (s) => `${s.toFixed(2)} s`,
    title:
      'Duration of an Eased focus move. Also drives Home and the planet approach, under either style.',
  },
  {
    key: 'rho',
    label: 'Geodesic ρ',
    min: 0.01,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(3),
    title: 'Zoom price. Low ρ stops the path climbing; below ~0.3 most moves hit a duration bound.',
  },
  {
    key: 'velocity',
    label: 'Geodesic V',
    min: 1,
    max: 100,
    step: 1,
    format: (v) => v.toFixed(0),
    title: 'Path length covered per second. Duration is length / V, clamped to min and max.',
  },
  {
    key: 'minS',
    label: 'Geodesic min',
    min: 0.1,
    max: 5,
    step: 0.05,
    format: (s) => `${s.toFixed(2)} s`,
    title: 'Shortest Geodesic move.',
  },
  {
    key: 'maxS',
    label: 'Geodesic max',
    min: 0.1,
    max: 5,
    step: 0.05,
    format: (s) => `${s.toFixed(2)} s`,
    title: 'Longest Geodesic move.',
  },
];
