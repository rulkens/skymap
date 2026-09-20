import type { FlowSourceEntry } from '../../../@types/data/flow/FlowSourceEntry';
import { Source } from '../../../data/source';

export const FLOW_ENTRY = {
  type: 'flow',
  code: Source.Flow,
  id: 'flow',
  label: 'Flow',
  allSky: true,
  // `SourceEntryBase` conformance, not the overlay's default gate — nothing
  // reads it (`ALL_VISIBLE_MASK` folds galaxy catalogs only). `DEFAULT_FLOW`
  // owns the default-off decision and the reason for it.
  visible: false,
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'flowfield',
} as const satisfies FlowSourceEntry;
