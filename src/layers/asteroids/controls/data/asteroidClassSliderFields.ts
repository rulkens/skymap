import type { SliderField } from '../../../../../packages/shared/src/@types/data/SliderField';
import type { AsteroidClassSliderKey } from '../../@types/AsteroidClassSliderKey';

/** The asteroid tuning section's per-class slider rows; the tint is a picker row, not a slider. */
export const ASTEROID_CLASS_SLIDER_FIELDS: readonly SliderField<AsteroidClassSliderKey>[] = [
  {
    key: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 4,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`,
    title: "Gain on the class's lifted flux, ahead of the flux floor",
  },
  {
    key: 'limitingMag',
    label: 'Flux floor',
    min: 8,
    max: 24,
    step: 0.1,
    format: (v) => `V ${v.toFixed(1)}`,
    title: 'Dots whose lifted flux is fainter than this V are not drawn',
  },
  {
    key: 'dotRadiusPx',
    label: 'Dot size',
    min: 0.5,
    max: 6,
    step: 0.05,
    format: (v) => `${v.toFixed(2)} px`,
    title: 'Half-width of an asteroid dot on screen',
  },
  {
    key: 'dotKnee',
    label: 'Dot knee',
    min: 0.02,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: "Ceiling of a dot's peak: lower makes a patch read by dot count",
  },
  {
    key: 'sizeKneeH',
    label: 'Size knee',
    min: 6,
    max: 16,
    step: 0.1,
    format: (v) => `H ${v.toFixed(1)}`,
    title: 'Sized by H: dots fainter than this H keep the dot size; brighter ones grow',
  },
  {
    key: 'sizeMaxScale',
    label: 'Size max',
    min: 1,
    max: 5,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`,
    title: 'Sized by H: the largest dot (Pallas) as a multiple of the dot size',
  },
];
