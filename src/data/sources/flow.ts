import type { FlowSourceEntry } from '../../@types/data/flow/FlowSourceEntry';
import { Source } from '../source';
import { MAX_PARTICLES } from '../flow/flowFieldConstants';

export const FLOW_ENTRY = {
  type: 'flow',
  code: Source.Flow,
  id: 'flow',
  label: 'Flow',
  allSky: true,
  // Default-off: the velocity cube is tens of MB and demand-loads on the first
  // enable, so a fresh session pays nothing until the user asks for it.
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'flowfield',
  // Look/motion defaults — the spike's hand-dialled advect look. Do not
  // "tidy" them; they ARE the look. `count` starts at the buffer ceiling so
  // the field reads dense the moment it's enabled; the slider trims downward.
  mode: 'advect',
  intensity: 0.18,
  count: MAX_PARTICLES,
  trail: 0.002,
  flowSpeed: 0.02,
  densityBias: 0.98,
  wander: 0.15,
  boundaryFadeWidth: 0.1,
} as const satisfies FlowSourceEntry;
