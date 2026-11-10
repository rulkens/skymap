/** The timeline model of the open draft, timed once its current revision has resolved; null with no draft. */
import { createSelector } from '@reduxjs/toolkit';

import { selectCollapsed, selectDraft } from '../../session/state/selectors';
import { selectTimelineCompile } from './selectTimelineCompile';
import { buildTimeline } from '../utils/buildTimeline';

export const selectTimeline = createSelector(
  [selectDraft, selectTimelineCompile, selectCollapsed],
  (draft, compile, collapsed) => (draft === null ? null : buildTimeline(draft, compile, collapsed)),
);
