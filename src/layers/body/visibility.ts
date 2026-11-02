// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { FOREGROUND_RECEDE } from '../../data/bands/foregroundRecede';
import { SOLAR_SYSTEM_CAPTION_RECEDE } from '../../data/bands/solarSystemCaptionRecede';
import { SOURCE_ENTRIES } from '../../data/sourceEntries';

// The caption categories, not body ids: Earth, planets and mesh bodies. Rows that draw
// no names (the S-stars) have no switch to declare.
const LABEL_BEARING_BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body' && e.bearsLabel).map(
  (e) => e.id,
);

export const bodyVisibility = [
  { key: 'orbitTrails', bands: { foreground: FOREGROUND_RECEDE } },
  {
    label: 'body',
    cluster: 'bodies',
    items: LABEL_BEARING_BODY_IDS,
    recession: 'mild',
    bands: { caption: SOLAR_SYSTEM_CAPTION_RECEDE },
  },
] as const satisfies readonly VisibilityEntry[];
