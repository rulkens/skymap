/**
 * watchFlyToLonLatSaga — the effect of `camera/flyToLonLat`: focus the body, then
 * TWEEN (the goHome pattern) to a centre-looking pose over the lon/lat. A plain
 * commit is lost under a followed focus: its winner edge bakes last frame's pose
 * back into `base` and `followHold` wins again. The tween delivers the framing,
 * so the follow row adopts where it lands.
 */
import { takeLatest, select, put, getContext } from 'typed-redux-saga';

import { flyToLonLat } from './flyToLonLatActions';
import { startCameraTween } from './cameraSlice';
import { updateSelectionFocus } from '../selection/selectionSlice';
import { selectFocusRef } from '../selection/selectors';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { lonLatFocusPose } from '../../utils/camera/lonLatFocusPose';
import { bodyFixedEyeM } from '../../utils/camera/bodyFixedEyeM';
import { eyeFrameOf } from '../../utils/camera/eyeFrameOf';
import { eyeMpcOf } from '../../utils/camera/eyeMpcOf';
import { centreLookingArm } from '../../utils/camera/centreLookingArm';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import { bodyFootprintRadiusM } from '../../utils/scene/bodyFootprintRadiusM';
import { toBodyArm, toWorldArm } from '../../services/engine/camera/poseFrameConversion';
import { bodyFocusDistance } from '../../services/engine/camera/bodyFocusDistance';
import { hostOf } from '../../services/engine/camera/rungs/hostOf';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { FLY_TO_LON_LAT_TWEEN_MS } from '../../data/camera/flyToLonLatTweenMs';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { SCENE_BODIES } from '../../data/bodies/sceneBodies';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../data/scaleUnits';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';
import type { SagaContext } from '../../store/types';

export function* watchFlyToLonLatSaga() {
  yield* takeLatest(flyToLonLat, function* (action) {
    const { lonDeg, latDeg, altKm, headingRad } = action.payload;
    const body = action.payload.body ?? (SCENE_EARTH.id as BodyId);
    const durationMs = action.payload.durationMs ?? FLY_TO_LON_LAT_TWEEN_MS;

    const cameraRuntime = yield* getContext<SagaContext['cameraRuntime']>('cameraRuntime');
    const runtime = cameraRuntime();
    if (runtime === null) return;

    // An idle command: the steady frame basis serves as both bases.
    const frame = yield* select(selectOrientation);
    const basis = ORIENTATION_FRAMES[frame];
    const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
    const bodies = deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>;
    const host = hostOf({ body }, { bodies, poseBasis: basis, upBasis: basis });
    if (host === null) return;

    const focus = yield* select(selectFocusRef);
    const sameBody = focus?.type === 'body' && focus.id === body;
    // Read in the body's fixed metres: the live world pose's `distance` is a range
    // to whatever it aims at, not the eye's height.
    const here = toBodyArm(runtime.from, basis, basis, body, host.state);
    // Off the focused body, the eye stands where a click-to-focus frames it.
    const footprintMpc =
      bodyFootprintRadiusM(findByIdOrThrow(SCENE_BODIES, body, 'flyToLonLat')) *
      SCALE_UNITS.M_TO_MPC;
    const eyeRadiusM = sameBody
      ? Math.hypot(...bodyFixedEyeM(here))
      : bodyFocusDistance(footprintMpc, runtime.fovYRad) / SCALE_UNITS.M_TO_MPC;
    const rangeM = altKm !== undefined ? altKm * 1000 : eyeRadiusM - host.radiusM;
    const heading =
      headingRad ?? (sameBody ? (eyeFrameOf(here, 1, BODY_LOCAL_FRAME.pole)?.azimuthRad ?? 0) : 0);

    // Nadir-looking, so `toWorldArm`'s view axis already passes through the
    // centre: only the target (surface point → centre) and distance change, and
    // the roll carrying the heading survives the re-aim untouched.
    const surface = lonLatFocusPose({ lonDeg, latDeg }, body, host.radiusM, rangeM, heading);
    const world = toWorldArm(
      surface,
      host.state,
      basis,
      basis,
      host.radiusM,
      host.standoffRadii,
      host.groundRadiusAtM,
    );
    const to = centreLookingArm(
      eyeMpcOf(world, basis),
      host.state.positionMpc,
      basis,
      world.roll ?? 0,
    );

    if (!sameBody) yield* put(updateSelectionFocus({ type: 'body', id: body }));
    yield* put(
      startCameraTween({
        from: runtime.from,
        to: to.pose,
        durationMs,
        easing: 'easeOutCubic',
        frame,
      }),
    );
  });
}
