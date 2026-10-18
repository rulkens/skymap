// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const localBubbleVisibility = [
  { key: 'localBubble', recession: 'strong' },
] as const satisfies readonly VisibilityEntry[];
