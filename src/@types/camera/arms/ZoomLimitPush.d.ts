import type { ClipData } from '../../animation/ClipData';
import type { SkySpot } from '../pose/SkySpot';
import type { Vec3 } from '../../math/Vec3';

/**
 * A fresh zoom notch pressed against an arm's limit, as a value the drain hands to
 * `watchZoomLimitSaga`. `out`: the sky arm's widest lens ate a wheel-out; `lift` is the exit
 * flight, built by the arm because only the engine's ctx can. `in`: a body-arm zoom-in that
 * started at the descent floor; `spot` and `pointLocalM` (body-fixed metres) are its cursor anchor.
 */
export type ZoomLimitPush =
  | { readonly edge: 'out'; readonly lift: ClipData }
  | { readonly edge: 'in'; readonly spot: SkySpot; readonly pointLocalM: Readonly<Vec3> };
