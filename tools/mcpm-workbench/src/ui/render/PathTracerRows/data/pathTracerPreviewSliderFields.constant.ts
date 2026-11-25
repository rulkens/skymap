import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';

/** The path tracer's preview-cost rows, each with its own setter (viewSlice). */
export const PATH_TRACER_PREVIEW_SLIDER_FIELDS: readonly SliderRowField<'divisor' | 'sampleCap'>[] =
  [
    {
      key: 'divisor',
      label: 'path tracer divisor',
      min: 1,
      max: 4,
      step: 1,
      format: (v) => v.toFixed(0),
      title:
        'Accumulates into floor(size/divisor), samples/sec up with divisor². Auto-boosts to 4 while the camera moves.',
    },
    {
      key: 'sampleCap',
      label: 'sample cap',
      min: 64,
      max: 4096,
      step: 64,
      format: (v) => v.toFixed(0),
      title:
        'Progressive accumulator stops forcing a render past this many samples (Monte Carlo noise falls as 1/sqrt(N)). Raising it while capped resumes accumulation without a reset; lowering it just goes idle sooner.',
    },
  ];
