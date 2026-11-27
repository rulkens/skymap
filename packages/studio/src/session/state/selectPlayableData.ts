/** The current revision's resolved draft when it compiles, else null: what the preview may play. */
import { createSelector } from '@reduxjs/toolkit';

import { selectCurrentResolution } from './selectors';
import { selectTimelineCompile } from '../../timeline/state/selectTimelineCompile';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

export const selectPlayableData = createSelector(
  [selectCurrentResolution, selectTimelineCompile],
  (resolution, compile): ClipData | null =>
    compile?.ok === true && resolution !== null && 'data' in resolution ? resolution.data : null,
);
