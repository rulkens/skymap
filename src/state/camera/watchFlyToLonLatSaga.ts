/**
 * watchFlyToLonLatSaga — the effect of the Earth Tile Atlas panel's
 * fly-to-coordinates instrument: resolve the pose and commit it.
 *
 * Commits INSTANTLY (`commitCameraPose`, not a tween) — a snap, not a fly —
 * which composes cleanly with the follow driver the same way a resting-pose
 * commit always does: `followBody` re-centres `target` on Earth's live
 * position every frame regardless of what `base.target` holds, and its
 * yaw/pitch ease is already saturated whenever Earth has been focused for a
 * while, the common case while poking at this panel.
 *
 * Deliberate behavior change from the old engine-handle version: `distance`
 * now comes from the RESTING pose (`camera.base`, committed at drag-end/zoom/
 * driver-deactivation) rather than the engine's live per-frame pose. The
 * instrument is used while idle, where the two agree.
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
import { absoluteArm } from '../../utils/camera/absoluteArm';
import { resolveWorldArm } from '../../services/engine/camera/poseFrameConversion';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { SCENE_EARTH } from '../../data/bodies/sceneEarth';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyState } from '../../@types/scene/BodyState';

export function* watchFlyToLonLatSaga() {
  yield* takeLatest(flyToLonLat, function* (action) {
    const { lonDeg, latDeg } = action.payload;

    const base = yield* select(selectCameraBase);
    const frameBasis = ORIENTATION_FRAMES[yield* select(selectOrientation)];
    const simDays = deriveSimDays(yield* select(selectTimeState), performance.now());
    const bodyStates = deriveBodyStates(simDays) as ReadonlyMap<BodyId, BodyState>;
    const earthState = bodyStates.get(SCENE_EARTH.id as BodyId);
    if (earthState === undefined) return;

    // The range is a world-arm reading, so the base is resolved first; this is an
    // idle instrument, so the steady frame basis serves for both halves.
    const distance = resolveWorldArm(base, bodyStates, frameBasis, frameBasis).distance;

    yield* put(
      commitCameraPose(
        absoluteArm(
          lonLatFocusPose(
            { lonDeg, latDeg },
            earthState.positionMpc,
            distance,
            earthState.orientation,
            frameBasis,
          ),
        ),
      ),
    );
  });
}
