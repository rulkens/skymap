/**
 * zoomLimitPushed — an arm's report that a fresh notch pressed its zoom limit, emitted by
 * `replayInput`. Reducer-less: `watchZoomLimitSaga` decides what, if anything, it starts.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ZoomLimitPush } from '../../@types/camera/arms/ZoomLimitPush';

export const zoomLimitPushed = createAction<ZoomLimitPush>('camera/zoomLimitPushed');
