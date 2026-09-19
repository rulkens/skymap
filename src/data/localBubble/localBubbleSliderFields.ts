import type { SliderField } from '../../@types/data/SliderField';

/** The Local Bubble's one tuning knob, shown in the DebugPanel. */
export const LOCAL_BUBBLE_SLIDER_FIELDS: readonly SliderField<'intensity'>[] = [
  {
    key: 'intensity',
    label: 'Intensity',
    min: 0,
    max: 2,
    step: 0.05,
    format: (value) => value.toFixed(2),
  },
];
