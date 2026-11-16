import type { SliderField } from '../../../../@types/data/SliderField';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';

/** The asteroid tuning section's global slider rows, the same for every class. */
export const ASTEROID_TUNING_SLIDER_FIELDS: readonly SliderField<AsteroidTuningSliderKey>[] = [
  {
    key: 'lift',
    label: 'Lift',
    min: 0,
    max: 3e6,
    step: 1e4,
    format: (v) => v.toExponential(2),
    title: "Display lift on every dot's flux; each class's brightness gain multiplies it",
  },
  {
    key: 'maxPhaseDimMag',
    label: 'Phase dim cap',
    min: 0,
    max: 8,
    step: 0.05,
    format: (v) => `${v.toFixed(2)} mag`,
    title: 'Most the phase law may dim a dot; the card keeps the physical V',
  },
  {
    key: 'thinBudget',
    label: 'Thin budget',
    min: 10_000,
    max: 900_000,
    step: 10_000,
    format: (v) => `${Math.round(v / 1000)}k dots`,
    title: 'Dots kept, brightest H first in each class, once zoomed out to the full zoom',
  },
  {
    key: 'thinStartZoomAu',
    label: 'Thin from',
    min: 0.1,
    max: 30,
    step: 0.1,
    format: (v) => `${v.toFixed(1)} AU`,
    title: 'Zoom under which every asteroid draws',
  },
  {
    key: 'thinFullZoomAu',
    label: 'Thin to budget',
    min: 0.5,
    max: 60,
    step: 0.5,
    format: (v) => `${v.toFixed(1)} AU`,
    title: 'Zoom from which only the budget draws',
  },
  {
    key: 'thinGainExponent',
    label: 'Thin gain',
    min: 0,
    max: 1.5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: "Survivors' tint × (kept share)^−this: 1 keeps the field's total light, 0 adds none",
  },
];
