// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';

// The Cosmicflows field reads at tens of Mpc; it yields with the survey cloud on the way in.
export const flowVisibility = [
  { key: 'flow', bands: { deepZoom: SURVEY_DEEP_ZOOM } },
] as const satisfies readonly VisibilityEntry[];
