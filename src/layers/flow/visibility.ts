// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const flowVisibility = [{ key: 'flow' }] as const satisfies readonly VisibilityEntry[];
