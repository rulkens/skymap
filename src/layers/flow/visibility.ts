// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { FLOW_DEEP_ZOOM } from '../../data/bands/flowDeepZoom';

export const flowVisibility = [
  { key: 'flow', bands: { deepZoom: FLOW_DEEP_ZOOM } },
] as const satisfies readonly VisibilityEntry[];
