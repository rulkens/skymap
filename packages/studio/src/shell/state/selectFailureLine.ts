/** Why the current revision cannot play, in the alert line's words; null while it resolves or once it compiles. */
import { createSelector } from '@reduxjs/toolkit';

import { selectCurrentResolution } from '../../session/state/selectors';
import { selectFullTimeline } from '../../timeline/state/selectFullTimeline';
import { compileErrorLine } from '../utils/compileErrorLine';

export const selectFailureLine = createSelector(
  // The full tree: a culprit folded inside a group still names itself.
  [selectFullTimeline, selectCurrentResolution],
  (timeline, resolution): string | null =>
    timeline?.error != null
      ? compileErrorLine(timeline.error, timeline.rows)
      : resolution !== null && 'message' in resolution
        ? resolution.message
        : null,
);
