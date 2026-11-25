import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';

export const AUTO_FIT_SLIDER_FIELDS: readonly SliderRowField<'autoFitPercent'>[] = [
  {
    key: 'autoFitPercent',
    label: 'fit %',
    min: 80,
    max: 100,
    step: 1,
    format: (v) => v.toFixed(0),
    title:
      'Fraction of catalog points the next Auto fit keeps, evicting the farthest-from-median fringe.',
  },
];
