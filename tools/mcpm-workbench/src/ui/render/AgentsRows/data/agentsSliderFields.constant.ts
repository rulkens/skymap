import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';
import type { ViewSlice } from '../../../../../@types/view/ViewSlice';

export const AGENTS_SLIDER_FIELDS: readonly SliderRowField<keyof ViewSlice['agents']>[] = [
  {
    key: 'intensity',
    label: 'intensity',
    min: 0.05,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: 'Brightness multiplier on the resolved agent splat.',
  },
  {
    key: 'pointSizePx',
    label: 'point size',
    min: 1,
    max: 8,
    step: 1,
    format: (v) => v.toFixed(0),
    title:
      "Per-agent splat footprint, in whole pixels — the splat compute kernel writes a discrete square, unlike the Galaxies layer's continuously-sized quad.",
  },
];
