/** The Geodesic focus move's knobs. Durations are seconds on screen; the component converts to ms. */

import type { SliderField } from '../../@types/data/SliderField';

export type GeodesicSliderKey = 'rho' | 'velocity' | 'minS' | 'maxS';

export const GEODESIC_SLIDER_FIELDS: readonly SliderField<GeodesicSliderKey>[] = [
  {
    key: 'rho',
    label: 'geodesic ρ',
    min: 0.001,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(3),
    title: 'Zoom price. Low ρ stops the path climbing; below ~0.3 most moves hit a duration bound.',
  },
  {
    key: 'velocity',
    label: 'geodesic V',
    min: 1,
    max: 100,
    step: 1,
    format: (v) => v.toFixed(0),
    title: 'Path length covered per second. Duration is length / V, clamped to min and max.',
  },
  {
    key: 'minS',
    label: 'geodesic min',
    min: 0.1,
    max: 5,
    step: 0.05,
    format: (s) => `${s.toFixed(2)} s`,
    title: 'Shortest Geodesic move.',
  },
  {
    key: 'maxS',
    label: 'geodesic max',
    min: 0.1,
    max: 5,
    step: 0.05,
    format: (s) => `${s.toFixed(2)} s`,
    title: 'Longest Geodesic move.',
  },
];
