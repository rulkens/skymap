/** An intent, not an edit: the saga resolves the value and edits. */
import { createAction } from '@reduxjs/toolkit';
import type { ObjectPick } from '../../@types/session/ObjectPick';

export const objectPicked = createAction<ObjectPick>('studio/objectPicked');
