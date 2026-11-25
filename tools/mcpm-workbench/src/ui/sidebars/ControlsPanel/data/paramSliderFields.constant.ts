import type { McpmParams } from '../../../../../@types/sim/McpmParams';
import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';

// Ranges are workbench UI convenience, not physics — wide enough to explore well past the
// SDSS-VAC preset in either direction. Keyed by McpmParams, not an array: a field added to
// McpmParams is a compile error here until it gets a row, the same exhaustiveness
// MCPM_PARAM_KEYS's sentinel gets independently (exportParams.ts), which sets the row order.
export const PARAM_SLIDER_FIELDS: { readonly [P in keyof McpmParams]: SliderRowField<P> } = {
  senseSpreadDeg: {
    key: 'senseSpreadDeg',
    label: 'sense spread (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    format: (v) => v.toFixed(1),
    title: 'Angular offset of the off-axis sense probes from the agent heading.',
  },
  senseDistanceMpc: {
    key: 'senseDistanceMpc',
    label: 'sense distance (Mpc)',
    min: 0,
    max: 20,
    step: 0.1,
    format: (v) => v.toFixed(1),
    title: 'How far ahead the sense probes sample the deposit grid.',
  },
  turnAngleDeg: {
    key: 'turnAngleDeg',
    label: 'turn angle (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    format: (v) => v.toFixed(1),
    title: 'Rotation toward the winning probe direction each step.',
  },
  moveDistanceMpc: {
    key: 'moveDistanceMpc',
    label: 'move distance (Mpc)',
    min: 0,
    max: 2,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Distance an agent travels per step.',
  },
  depositValue: {
    key: 'depositValue',
    label: 'deposit value',
    min: 0,
    max: 10,
    step: 0.1,
    format: (v) => v.toFixed(1),
    title: 'Amount each agent adds to the deposit (steering) grid per step.',
  },
  persistence: {
    key: 'persistence',
    label: 'persistence',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    title: 'Fraction of the deposit grid that survives each decay step.',
  },
  sharpness: {
    key: 'sharpness',
    label: 'sharpness',
    min: 0,
    max: 10,
    step: 0.1,
    format: (v) => v.toFixed(1),
    title:
      'Exponent on probe samples in the turn decision — higher steers harder toward the strongest signal.',
  },
  normalizationFactor: {
    key: 'normalizationFactor',
    label: 'normalization',
    min: 0,
    max: 5,
    step: 0.05,
    format: (v) => v.toFixed(2),
    title: 'Rescales data-point deposits against agent deposits.',
  },
};
