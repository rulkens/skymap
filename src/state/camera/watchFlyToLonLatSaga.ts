/**
 * watchFlyToLonLatSaga — the effect of the Earth Tile Atlas panel's
 * fly-to-coordinates instrument: put the requested lon/lat under the camera,
 * at the altitude and heading it already has.
 *
 * Commits INSTANTLY (`commitCameraPose`, not a tween) — a snap, not a fly — and
 * commits a BODY arm whatever the altitude: the intent is body-relative, so it
 * authors a body arm and the frame fold reconciles an out-of-band one (spec §9).
 */
import { takeLatest, select, put } from 'typed-redux-saga';

import { flyToLonLat } from './flyToLonLatActions';
import { commitCameraPose } from './cameraSlice';
import { selectCameraBase } from './selectors';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { lonLatFocusPose } from '../../utils/camera/lonLatFocusPose';
import { bodyFixedEyeM } from '../../utils/camera/bodyFixedEyeM';
import { eyeFrameOf } from '../../utils/camera/eyeFrameOf';
import { resolveWorldArm, toBodyArm } from '../../services/engine/camera/poseFrameConversion';
import { BODY_LOCAL_FRAME } from '../../data/camera/bodyLocalFrame';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';

export function* watchFlyToLonLatSaga() {
  yield* takeLatest(flyToLonLat, function* (action) {
    const { lonDeg, latDeg } = action.payload;
    const bodyId = SCENE_EARTH.id as BodyId;

    const base = yield* select(selectCameraBase);
    const frameBasis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
    const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
    const bodyStates = deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>;
    const earthState = bodyStates.get(bodyId);
    if (earthState === undefined) return;

    // Where the camera stands now, in Earth's fixed metres — one reading for
    // both halves of "same altitude, same heading". The resolved arm's
    // `distance` cannot serve: it is a sightline range in a body arm but an
    // orbit radius to an arbitrary target in the absolute one. This is an idle
    // instrument, so the steady frame basis serves as both bases.
    const here = toBodyArm(
      resolveWorldArm(base, bodyStates, frameBasis, frameBasis),
      frameBasis,
      frameBasis,
      bodyId,
      earthState,
    );
    const rangeM = Math.hypot(...bodyFixedEyeM(here)) - SCENE_EARTH.radiusM;
    const headingRad = eyeFrameOf(here, 1, BODY_LOCAL_FRAME.pole)?.azimuthRad ?? 0;

    yield* put(
      commitCameraPose({
        frame: { body: bodyId },
        pose: lonLatFocusPose({ lonDeg, latDeg }, bodyId, SCENE_EARTH.radiusM, rangeM, headingRad),
      }),
    );
  });
}
