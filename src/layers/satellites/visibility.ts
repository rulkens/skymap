// Data only: `appVisibility.ts` derives core's address types from this. No distance band: the
// regions anchor at the J2000 snapshot, so the pass fades by the live distance to Earth itself.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const satellitesVisibility = [
  { key: 'satellites' },
] as const satisfies readonly VisibilityEntry[];
