/** What the Layer can show, as data. Imports data only: `appVisibility.ts` derives core's
 * address types from it, and a Layer-typed import would make that a circular alias. */

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';

export const localBubbleVisibility = [
  { key: 'localBubble', recession: 'strong' },
] as const satisfies readonly VisibilityEntry[];
