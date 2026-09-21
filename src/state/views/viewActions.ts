/**
 * viewActions — `openView(id)`, the reducer-less signal `watchTakeoverSaga`
 * picks up to start a view's takeover; `exitTakeover` ends it, shared with
 * tours.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ViewId } from '../../@types/views/ViewId';

export const openView = createAction<ViewId>('view/open');
