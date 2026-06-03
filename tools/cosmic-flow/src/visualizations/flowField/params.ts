/**
 * Flow-field slider specs — the data-driven UI description for the two modes.
 *
 * Ported from the spike's SLIDERS table (and its per-mode RANGE overrides). The
 * spike owned one slider panel per mode; here each mode gets its own readonly
 * spec list so the control panel can render the right ranges. Two key parity
 * details are preserved verbatim:
 *
 *   - 'wander' exists ONLY for advect (the streamline integrator ignores it).
 *   - advect TIGHTENS the trail and flow-speed ranges (spike RANGE[0]): a
 *     shorter trail range and a finer, slower flow-speed range, because in
 *     advect flowSpeed drives head MOTION (independent of trail length) rather
 *     than the streamline pulse rate.
 *
 * Each spec's `id` MUST equal a FlowModeParams key (count / flowSpeed /
 * densityBias / wander / trail / size / exposure / contrast). That is the
 * contract: the value the UI produces is written into FrameContext.params under
 * the spec id, and the visualization reads its knobs by that same key.
 */
import type { SliderSpec } from '../../../@types/visualizations/SliderSpec';

// Shared base specs (streamline ranges). Advect derives from these, swapping in
// the tightened trail/flowSpeed ranges and adding wander.
const COUNT: SliderSpec = {
  id: 'count',
  label: 'particles',
  min: 1000,
  max: 100000,
  step: 1000,
  format: (v) => Math.round(v).toLocaleString(),
};
const FLOW_SPEED: SliderSpec = {
  id: 'flowSpeed',
  label: 'flow speed',
  min: 0,
  max: 1.5,
  step: 0.01,
  format: (v) => v.toFixed(2),
};
const DENSITY_BIAS: SliderSpec = {
  id: 'densityBias',
  label: 'density bias',
  min: 0,
  max: 1,
  step: 0.05,
  format: (v) => v.toFixed(2),
};
const WANDER: SliderSpec = {
  id: 'wander',
  label: 'wander',
  min: 0,
  max: 0.5,
  step: 0.01,
  format: (v) => v.toFixed(2),
};
const TRAIL: SliderSpec = {
  id: 'trail',
  label: 'trail',
  min: 0.002,
  max: 0.03,
  step: 0.001,
  format: (v) => v.toFixed(3),
};
const SIZE: SliderSpec = {
  id: 'size',
  label: 'size',
  min: 0.0003,
  max: 0.004,
  step: 0.0001,
  format: (v) => v.toFixed(4),
};
const EXPOSURE: SliderSpec = {
  id: 'exposure',
  label: 'exposure',
  min: 0.1,
  max: 1.2,
  step: 0.02,
  format: (v) => v.toFixed(2),
};
const CONTRAST: SliderSpec = {
  id: 'contrast',
  label: 'contrast',
  min: 1.4,
  max: 3.0,
  step: 0.05,
  format: (v) => v.toFixed(2),
};

// Advect-only range overrides (spike RANGE[0]).
const ADVECT_TRAIL: SliderSpec = { ...TRAIL, min: 0.0005, max: 0.02, step: 0.0005 };
const ADVECT_FLOW_SPEED: SliderSpec = { ...FLOW_SPEED, min: 0, max: 0.3, step: 0.002 };

/** Streamline mode: no wander, base trail/flow-speed ranges. */
export const FLOW_PARAM_SPECS: readonly SliderSpec[] = [
  COUNT,
  FLOW_SPEED,
  DENSITY_BIAS,
  TRAIL,
  SIZE,
  EXPOSURE,
  CONTRAST,
];

/** Advect mode: includes wander, tightened trail + flow-speed ranges. */
export const FLOW_ADVECT_PARAM_SPECS: readonly SliderSpec[] = [
  COUNT,
  ADVECT_FLOW_SPEED,
  DENSITY_BIAS,
  WANDER,
  ADVECT_TRAIL,
  SIZE,
  EXPOSURE,
  CONTRAST,
];
