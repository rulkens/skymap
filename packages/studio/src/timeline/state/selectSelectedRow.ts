/** The selected row from the full row tree, so folding its group does not lose the selection. */
import { createSelector } from '@reduxjs/toolkit';

import { rowKey } from '../../draft/utils/rowKey';
import { selectSelection } from '../../session/state/selectors';
import { selectFullTimeline } from './selectFullTimeline';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

export const selectSelectedRow = createSelector(
  [selectFullTimeline, selectSelection],
  (timeline, selection): TimelineRow | null => {
    if (timeline === null || selection === null) return null;
    const id = rowKey(selection);
    return timeline.rows.find((row) => row.id === id) ?? null;
  },
);
