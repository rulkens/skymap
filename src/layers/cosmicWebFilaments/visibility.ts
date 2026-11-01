// Data only: `appVisibility.ts` derives core's address types from this.

import type { VisibilityEntry } from '../../@types/engine/layer/VisibilityEntry';
import { SURVEY_DEEP_ZOOM } from '../../data/bands/surveyDeepZoom';

// The skeleton traces the survey it was fitted to, so it yields with the survey cloud.
export const cosmicWebFilamentsVisibility = [
  { key: 'cosmicWebFilaments', recession: 'strong', bands: { deepZoom: SURVEY_DEEP_ZOOM } },
] as const satisfies readonly VisibilityEntry[];
