/**
 * enterSky — stand at a spot and look up, as a `sky` takeover (`watchTakeoverSaga`). Every way
 * in dispatches it; `pointLocalM` (body-fixed metres) is the ground point a near entry glides
 * to, null for a place or typed coordinates, which arrive from wherever the camera is.
 */
import { createAction } from '@reduxjs/toolkit';

import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';

export const enterSky = createAction<{ spot: SkySpot; pointLocalM: Vec3 | null }>('sky/enter');
