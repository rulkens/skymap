import type { McpmParams } from '../../../../@types/McpmParams';

type ParamSliderSpec = {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly info: string;
};

// Ranges are workbench UI convenience, not physics — wide enough to explore well past the
// SDSS-VAC preset in either direction. Record<keyof McpmParams, …>, not an array of {id, …}
// literals: a field added to McpmParams is a compile error here until it gets a spec, the same
// exhaustiveness MCPM_PARAM_KEYS's sentinel gets independently (exportParams.ts) — no shared
// array to keep the two in sync by hand.
export const PARAM_SLIDER_SPECS: Record<keyof McpmParams, ParamSliderSpec> = {
  senseSpreadDeg: {
    label: 'sense spread (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Angular offset of the off-axis sense probes from the agent heading.',
  },
  senseDistanceMpc: {
    label: 'sense distance (Mpc)',
    min: 0,
    max: 20,
    step: 0.1,
    info: 'How far ahead the sense probes sample the deposit grid.',
  },
  turnAngleDeg: {
    label: 'turn angle (deg)',
    min: 0,
    max: 90,
    step: 0.5,
    info: 'Rotation toward the winning probe direction each step.',
  },
  moveDistanceMpc: {
    label: 'move distance (Mpc)',
    min: 0,
    max: 2,
    step: 0.01,
    info: 'Distance an agent travels per step.',
  },
  depositValue: {
    label: 'deposit value',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Amount each agent adds to the deposit (steering) grid per step.',
  },
  persistence: {
    label: 'persistence',
    min: 0,
    max: 1,
    step: 0.01,
    info: 'Fraction of the deposit grid that survives each decay step.',
  },
  sharpness: {
    label: 'sharpness',
    min: 0,
    max: 10,
    step: 0.1,
    info: 'Exponent on probe samples in the turn decision — higher steers harder toward the strongest signal.',
  },
  normalizationFactor: {
    label: 'normalization',
    min: 0,
    max: 5,
    step: 0.05,
    info: 'Rescales data-point deposits against agent deposits.',
  },
};
