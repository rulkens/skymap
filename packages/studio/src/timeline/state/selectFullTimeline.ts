/** The open draft's timeline with nothing collapsed: every row, so a selection survives folding. */
import { createSelector } from '@reduxjs/toolkit';

import { selectDraft } from '../../session/state/selectors';
import { selectTimelineCompile } from './selectTimelineCompile';
import { buildTimeline } from '../utils/buildTimeline';

export const selectFullTimeline = createSelector(
  [selectDraft, selectTimelineCompile],
  (draft, compile) => (draft === null ? null : buildTimeline(draft, compile, [])),
);
