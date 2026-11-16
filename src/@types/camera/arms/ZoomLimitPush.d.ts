import type { ClipData } from '../../animation/ClipData';
import type { SceneBodyId } from '../../scene/SceneBodyId';
import type { Vec3 } from '../../math/Vec3';

/**
 * A zoom notch pressed against an arm's limit, as a value: the arm reports every press, and the
 * drain hands the ones that push to `watchZoomLimitSaga`. `out`: the sky arm's widest lens ate a wheel-out; `lift` is the exit
 * flight, built by the arm because only the engine's ctx can. `in`: a body-arm zoom-in that
 * started at the descent floor; `pointLocalM` is its cursor anchor on `body`, body-fixed metres.
 */
export type ZoomLimitPush =
  | { readonly edge: 'out'; readonly lift: ClipData }
  | { readonly edge: 'in'; readonly body: SceneBodyId; readonly pointLocalM: Readonly<Vec3> };
