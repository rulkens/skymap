/**
 * arriveSaga — the sky takeover's arrival and stand (spec §4.3, §5); it returns once the person
 * no longer stands at `spot`. A near entry glides to its ground point. A far one first plays the
 * approach and takes the ground from the centre readout that lands under the spot, which the
 * approach ends looking straight down at; with none in `ARRIVAL_GROUND_WAIT_MS` it glides to
 * the outer relief bound and the sky leg's live ground takes the cut. A clip's end edge commits
 * the pose it held just after `clipEnded`: the sky after a full glide, anywhere else after a
 * foreign stop. Standing, the first commit outside the sky frame ends it.
 */
import { actionChannel, call, delay, put, race, select, take } from 'typed-redux-saga';
import type { Action } from '@reduxjs/toolkit';

import { commitCameraPose } from '../camera/cameraSlice';
import { skyEntryReported } from './skySlice';
import { selectCameraBase } from '../camera/selectors';
import { selectOrientation } from '../settings/selectors';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { approachClip } from './approachClip';
import { arrivalClip } from './arrivalClip';
import { playSkyClipSaga } from './playSkyClipSaga';
import { skyArmCtxSaga } from './skyArmCtxSaga';
import { offSpotM } from '../../utils/sky/offSpotM';
import { radToDeg } from '../../utils/math/radToDeg';
import { surfacePointBodyFixed } from '../../utils/geo/surfacePointBodyFixed';
import { toBodyArm } from '../../services/engine/camera/arms/body/poseFrameConversion';
import { skyPoseFromBodyArm } from '../../services/engine/camera/arms/sky/utils/skyPoseFromBodyArm';
import { isSkyArm } from '../../services/engine/camera/arms/sky/isSkyArm';
import { refoldTo } from '../../services/engine/camera/arms/refoldTo';
import { hostOrThrow } from '../../services/engine/camera/arms/hostOrThrow';
import { ARRIVAL_APPROACH_SEC } from '../../data/sky/arrivalApproachSec';
import { ARRIVAL_GROUND_MATCH_M } from '../../data/sky/arrivalGroundMatchM';
import { ARRIVAL_GROUND_WAIT_MS } from '../../data/sky/arrivalGroundWaitMs';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';

export function* arriveSaga(spot: SkySpot, pointLocalM: Vec3 | null) {
  const frame = yield* select(selectOrientation);
  const now = yield* call(skyArmCtxSaga, 0);
  const runtime = yield* call(liveCameraRuntimeSaga);
  const host = hostOrThrow({ body: spot.body }, now);
  // The heading the view already has over the spot, so standing turns no head.
  const here = toBodyArm(runtime.from, now.poseBasis, now.upBasis, spot.body, host.state);
  const headingRad = skyPoseFromBodyArm(here, spot).azimuthRad;
  const { fovYRad } = runtime;
  // Standing, the old spot's arm holds through any flight (focus stays on its body), so the
  // approach would refold into it every frame and no readout could name the new ground.
  // Its body-arm image is a cut nobody sees: the clip draws from `runtime.from`.
  const base = yield* select(selectCameraBase);
  if (isSkyArm(base))
    yield* put(commitCameraPose(refoldTo(base, { body: base.frame.sky.body }, now)));

  let ground = pointLocalM;
  if (ground === null) {
    const ctx = yield* call(skyArmCtxSaga, ARRIVAL_APPROACH_SEC * 1000);
    const approach = approachClip(runtime.from, spot, headingRad, fovYRad, ctx);
    // Opened before the flight: the readout can land in the clip's held last frame.
    const readouts = yield* actionChannel(
      (a: Action): a is ReturnType<typeof skyEntryReported> =>
        skyEntryReported.match(a) &&
        a.payload.spot?.body === spot.body &&
        a.payload.pointLocalM !== null &&
        offSpotM(a.payload.pointLocalM, spot) < ARRIVAL_GROUND_MATCH_M,
    );
    try {
      if (!(yield* call(playSkyClipSaga, approach, frame))) return;
      const { seen } = yield* race({ seen: take(readouts), late: delay(ARRIVAL_GROUND_WAIT_MS) });
      ground =
        seen?.payload.pointLocalM ??
        surfacePointBodyFixed(radToDeg(spot.latRad), radToDeg(spot.lonRad), host.outerBoundRadiusM);
    } finally {
      readouts.close();
    }
  }

  const { from } = yield* call(liveCameraRuntimeSaga);
  const glide = arrivalClip(from, spot, ground, headingRad, fovYRad, yield* call(skyArmCtxSaga, 0));
  if (!(yield* call(playSkyClipSaga, glide, frame))) return;
  let commit = yield* take(commitCameraPose);
  while (isSkyArm(commit.payload)) commit = yield* take(commitCameraPose);
}
