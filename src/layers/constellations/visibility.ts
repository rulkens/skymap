// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const constellationsVisibility = [
  { key: 'constellations', recession: 'strong' },
  { label: 'constellations', cluster: 'constellations', of: 'constellations', recession: 'strong' },
] as const satisfies readonly VisibilityEntry[];
