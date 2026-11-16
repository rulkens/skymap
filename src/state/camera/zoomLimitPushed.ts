/**
 * zoomLimitPushed — a notch that pushed an arm's zoom limit, as `replayInput` decided it from the
 * arm's report. Reducer-less: `watchZoomLimitSaga` decides what, if anything, it starts.
 */
import { createAction } from '@reduxjs/toolkit';

import type { ZoomLimitPush } from '../../@types/camera/arms/ZoomLimitPush';

export const zoomLimitPushed = createAction<ZoomLimitPush>('camera/zoomLimitPushed');
