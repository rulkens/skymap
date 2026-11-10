/** The compile of the current revision's resolution; null while unresolved or when resolving failed. */
import { createSelector } from '@reduxjs/toolkit';

import { selectCurrentResolution, selectPreview } from '../../session/state/selectors';
import { compileTimeline } from '../utils/compileTimeline';
import type { TimelineCompile } from '../../@types/rows/TimelineCompile';

export const selectTimelineCompile = createSelector(
  [selectCurrentResolution, selectPreview],
  (resolution, preview): TimelineCompile | null =>
    resolution === null || preview === null || !('data' in resolution)
      ? null
      : compileTimeline(resolution.data, preview.frame),
);
