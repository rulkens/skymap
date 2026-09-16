/**
 * flyToLonLatActions — the body-generic "stand over this lon/lat" camera
 * command. Reducer-less: `watchFlyToLonLatSaga` resolves the body's live state
 * and the omitted fields, then flies there.
 */
import { createAction } from '@reduxjs/toolkit';

import type { BodyId } from '../../@types/data/body/BodyId';

/** Omitted `altKm`/`headingRad` keep the camera's own over the focused body; over
 * any other body they are its click-to-focus distance and north up. */
export type FlyToLonLatPayload = {
  readonly lonDeg: number;
  readonly latDeg: number;
  /** Defaults to Earth. */
  readonly body?: BodyId;
  readonly altKm?: number;
  readonly headingRad?: number;
  readonly durationMs?: number;
};

export const flyToLonLat = createAction<FlyToLonLatPayload>('camera/flyToLonLat');
