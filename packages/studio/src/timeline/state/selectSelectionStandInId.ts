/**
 * The id of the visible row that stands for the selection: the selected row itself, or when folding
 * hides it the nearest ancestor still shown, which the outline marks. Null with no selection.
 */
import { createSelector } from '@reduxjs/toolkit';

import { selectCollapsed } from '../../session/state/selectors';
import { selectFullTimeline } from './selectFullTimeline';
import { selectSelectedRow } from './selectSelectedRow';

export const selectSelectionStandInId = createSelector(
  [selectFullTimeline, selectSelectedRow, selectCollapsed],
  (timeline, selected, collapsed): string | null => {
    if (timeline === null || selected === null) return null;
    const byId = new Map(timeline.rows.map((row) => [row.id, row]));
    // The topmost folded ancestor hides everything under it, so it is the one still visible.
    let standIn = selected.id;
    for (
      let at = byId.get(selected.parentId ?? '');
      at !== undefined;
      at = byId.get(at.parentId ?? '')
    ) {
      if (collapsed.includes(at.id)) standIn = at.id;
    }
    return standIn;
  },
);
