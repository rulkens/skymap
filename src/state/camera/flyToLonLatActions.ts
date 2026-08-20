/**
 * flyToLonLatActions — the request signal that drives the Earth Tile Atlas
 * debug panel's fly-to-coordinates instrument.
 *
 * `flyToLonLat({ lonDeg, latDeg })` asks to snap the camera so its sub-camera
 * point lands exactly there. It is reducer-less — `watchFlyToLonLatSaga`
 * resolves Earth's live position/orientation and the resting distance, then
 * commits the computed pose — the same naming/resolving split
 * `clipActions.ts` and `orientationActions.ts` draw for their sagas.
 */
import { createAction } from '@reduxjs/toolkit';

export type FlyToLonLatPayload = { readonly lonDeg: number; readonly latDeg: number };

export const flyToLonLat = createAction<FlyToLonLatPayload>('camera/flyToLonLat');
