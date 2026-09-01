import type { RaymarchSliderKey } from '../../../../@types/RaymarchSliderKey';

type RaymarchSliderSpec = {
  readonly key: RaymarchSliderKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly format: (value: number) => string;
  readonly info?: string;
  /** Present ⇒ the pill travels in log10 space: min/max/step are log10 units,
   * and `format` receives the log10 value, not the stored one. */
  readonly log?: boolean;
};

// Ranges bracket the fork's shipped defaults (viewSlice's `defaultViewSlice`
// docblock). `ParamSlider` is linear-only, so decade-spanning params map to
// log10 here at the spec seam; trimDensity's range includes 0 so it cannot.
export const RAYMARCH_SLIDERS: readonly RaymarchSliderSpec[] = [
  {
    key: 'opticalThickness',
    label: 'optical thickness',
    min: 0.01,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    info: 'Scales how opaque a given trace density renders along the ray.',
  },
  {
    key: 'sampleWeight',
    label: 'sample weight',
    min: -7,
    max: 0,
    step: 0.05,
    log: true,
    format: (v) => Math.pow(10, v).toExponential(1),
    info: 'Inverts the ~100x steady-state amplification of the trace decay (1% retained per step).',
  },
  {
    key: 'trimDensity',
    label: 'trim density',
    min: 0,
    max: 0.5,
    step: 0.00001,
    format: (v) => v.toFixed(5),
    info: 'Trace values at or below this render as empty space.',
  },
  {
    key: 'stepVoxels',
    label: 'step voxels',
    min: 0.25,
    max: 4,
    step: 0.05,
    format: (v) => v.toFixed(2),
    info: '1 is fork-parity sampling — below 1 oversamples each voxel, above 1 skips some.',
  },
];
