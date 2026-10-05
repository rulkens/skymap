import type { FlowSourceEntry } from '../../../@types/data/flow/FlowSourceEntry';
import { Source } from '../../../data/source';

export const FLOW_ENTRY = {
  type: 'flow',
  code: Source.Flow,
  id: 'flow',
  label: 'Flow',
  allSky: true,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'flowfield',
} as const satisfies FlowSourceEntry;
