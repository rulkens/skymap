/** The selected row, or null with no selection or when its group is collapsed (only visible rows exist). */
import { createSelector } from '@reduxjs/toolkit';

import { rowKey } from '../../draft/utils/rowKey';
import { selectSelection } from '../../session/state/selectors';
import { selectTimeline } from './selectTimeline';
import type { TimelineRow } from '../../@types/rows/TimelineRow';

export const selectSelectedRow = createSelector(
  [selectTimeline, selectSelection],
  (timeline, selection): TimelineRow | null => {
    if (timeline === null || selection === null) return null;
    const id = rowKey(selection);
    return timeline.rows.find((row) => row.id === id) ?? null;
  },
);
