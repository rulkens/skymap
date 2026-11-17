import type { FlowSourceEntry } from '../../../@types/data/flow/FlowSourceEntry';

export const FLOW_ENTRY = {
  type: 'flow',
  id: 'flow',
  label: 'Flow',
  allSky: true,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'flowfield',
} as const satisfies FlowSourceEntry;
