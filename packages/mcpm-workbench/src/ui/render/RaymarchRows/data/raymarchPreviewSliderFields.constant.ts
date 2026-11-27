import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';

export const RAYMARCH_PREVIEW_SLIDER_FIELDS: readonly SliderRowField<'divisor'>[] = [
  {
    key: 'divisor',
    label: 'divisor',
    min: 1,
    max: 8,
    step: 1,
    format: (v) => v.toFixed(0),
    title:
      "Marches into a floor(size/divisor) offscreen target and bilinear-upsamples it in, instead of straight into the frame. Fragment cost falls with the square of the divisor; 3 matches the main app's volume row.",
  },
];
