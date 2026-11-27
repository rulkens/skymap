import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';
import type { setRaymarchParam } from '../../../../state/view/viewSlice';

// Ranges bracket the fork's shipped defaults (viewSlice's `defaultViewSlice`
// docblock). Decade-spanning params run in log10; trimDensity's range includes 0, so it cannot.
export const RAYMARCH_SLIDER_FIELDS: readonly SliderRowField<
  Parameters<typeof setRaymarchParam>[0]['key']
>[] = [
  {
    key: 'opticalThickness',
    label: 'optical thickness',
    min: 0.01,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Scales how opaque a given trace density renders along the ray.',
  },
  {
    key: 'sampleWeight',
    label: 'sample weight',
    min: -7,
    max: 0,
    step: 0.05,
    log: true,
    format: (v) => v.toExponential(1),
    title:
      'Inverts the ~100x steady-state amplification of the trace decay (1% retained per step).',
  },
  {
    key: 'trimDensity',
    label: 'trim density',
    min: 0,
    max: 0.5,
    step: 0.00001,
    format: (v) => v.toFixed(5),
    title: 'Trace values at or below this render as empty space.',
  },
  {
    key: 'stepVoxels',
    label: 'step voxels',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: '1 is fork-parity sampling — below 1 oversamples each voxel, above 1 skips some.',
  },
];
