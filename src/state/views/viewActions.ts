/**
 * viewActions — the reducer-less signal a view's takeover starts on.
 *
 * `openView(id)` looks the id up in `viewRegistry` and runs `viewBody` under
 * `runTakeover({ kind: 'view', id })`, exactly as `startTour` does for tours
 * (`watchTakeoverSaga` picks up both via its `startRequests` loop). Ending a
 * view is `exitTakeover` (`state/takeover/takeoverActions.ts`), shared with
 * tours — a view has no start-specific teardown of its own.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ViewId } from '../../@types/views/ViewId';

export const openView = createAction<ViewId>('view/open');
