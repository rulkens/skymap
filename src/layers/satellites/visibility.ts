// Data only: `appVisibility.ts` derives core's address types from this. No distance band: the
// regions anchor at the J2000 snapshot, so the pass fades by the live distance to Earth itself.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SATELLITE_CLASSES } from '../../data/satellites/satelliteClasses';

export const satellitesVisibility = [
  { key: 'satellites', items: SATELLITE_CLASSES, selects: ['satellite'] },
] as const satisfies readonly VisibilityEntry[];
