import type { SliderField } from '../../../../@types/data/SliderField';
import type { StellarStreamsLook } from '../@types/StellarStreamsLook';

/** One slider per look knob, shared by both looks in the DebugPanel. */
export const STELLAR_STREAMS_LOOK_RANGES: readonly SliderField<keyof StellarStreamsLook>[] = [
  {
    key: 'intensity',
    label: 'Intensity',
    min: 0,
    max: 0.3,
    step: 0.001,
    format: (v) => v.toFixed(3),
  },
  {
    key: 'sizeScale',
    label: 'Size scale',
    min: 0.05,
    max: 3,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Multiplies each particle’s size',
  },
  {
    key: 'stretch',
    label: 'Stretch',
    min: 0,
    max: 10,
    step: 0.1,
    format: (v) => v.toFixed(1),
    title: 'Length of each streak along its orbit',
  },
  {
    key: 'minPx',
    label: 'Min px',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: 'Smallest sprite size in pixels; smaller particles dim instead',
  },
  {
    key: 'flow',
    label: 'Flow',
    min: 0,
    max: 12,
    step: 0.5,
    format: (v) => v.toFixed(1),
    title: 'Drift along the orbit, in kpc per 8 s loop; 0 stops it',
  },
];
