/** An intent, not an edit: the slice ignores it; the saga resolves the position and edits. */
import { createAction } from '@reduxjs/toolkit';
import type { PositionPick } from '../../@types/session/PositionPick';

export const positionPicked = createAction<PositionPick>('studio/positionPicked');
