/** What the Layer can show and label, as data. Imports data only: `appVisibility.ts` derives
 * core's address types from it, and a Layer-typed import would make that a circular alias. */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SOURCE_ENTRIES } from '../../data/sourceEntries';

// The caption categories, not body ids: Earth, planets and mesh bodies. Rows that draw
// no names (the S-stars) have no switch to declare.
const LABEL_BEARING_BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body' && e.bearsLabel).map(
  (e) => e.id,
);

export const bodyVisibility = [
  { key: 'orbitTrails' },
  { label: 'body', cluster: 'bodies', items: LABEL_BEARING_BODY_IDS, recession: 'mild' },
] as const satisfies readonly VisibilityEntry[];
