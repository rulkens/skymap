// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

// Directions on the sky read the same at every scale, so the grid has no band.
export const skyGridVisibility = [{ key: 'skyGrid' }] as const satisfies readonly VisibilityEntry[];
