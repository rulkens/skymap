/**
 * skyBodySaga — the `sky` takeover's body (spec §5). It skips `withSceneSnapshotSaga`, as clips
 * do: time and settings changed while standing stay (R15). Focus the spot's body (the sky arm
 * releases off its subtree), play the arrival as a camera clip — never `startClip`, which
 * would start a clip takeover and preempt this one — then wait. A commit outside the sky frame
 * once standing (lift-off, a focus fly, a link's pose) ends it as it stands; so does a plain
 * `exitTakeover` (a hash change, the remote). Only `exitTakeover({ restore: true })` flies
 * back to `restore`, and the run ends once that flight lands.
 */
import { call, put, race, select, take } from 'typed-redux-saga';

import { exitTakeover } from '../takeover/takeoverActions';
import { clipEnded, clipStarted, commitCameraPose } from '../camera/cameraSlice';
import { updateSelectionFocus } from '../selection/selectionSlice';
import { selectOrientation } from '../settings/selectors';
import { selectTimeState } from '../time/selectors';
import { liveCameraRuntimeSaga } from '../navigation/liveCameraRuntimeSaga';
import { arrivalClip } from './arrivalClip';
import { returnClip } from './returnClip';
import { deriveSimDays } from '../../utils/time/deriveSimDays';
import { datumOnlyTerrainHeight } from '../../utils/camera/terrain/datumOnlyTerrainHeight';
import { deriveBodyStates } from '../../services/engine/frame/deriveBodyStates';
import { toBodyArm } from '../../services/engine/camera/arms/body/poseFrameConversion';
import { skyPoseFromBodyArm } from '../../services/engine/camera/arms/sky/utils/skyPoseFromBodyArm';
import { isSkyArm } from '../../services/engine/camera/arms/sky/isSkyArm';
import { hostOrThrow } from '../../services/engine/camera/arms/hostOrThrow';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { ARRIVAL_APPROACH_SEC } from '../../data/sky/arrivalApproachSec';
import type { ClipData } from '../../@types/animation/ClipData';
import type { SkyRestore } from '../../@types/takeover/SkyRestore';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import type { Vec3 } from '../../@types/math/Vec3';
import type { RootState } from '../../store/types';

export function* skyBodySaga(
  spot: SkySpot,
  pointLocalM: Vec3 | null,
  restore: SkyRestore,
): Generator {
  const runtime = yield* call(liveCameraRuntimeSaga);
  const orientation = yield* select(selectOrientation);
  const basis = ORIENTATION_FRAMES[orientation];
  const time = yield* select(selectTimeState);
  const ctxAt = (offsetMs: number) => ({
    bodies: deriveBodyStates(deriveSimDays(time, performance.now() + offsetMs)),
    poseBasis: basis,
    upBasis: basis,
    terrainHeightAt: datumOnlyTerrainHeight,
  });
  const now = ctxAt(0);
  // The heading the view already has over the spot, so standing turns no head.
  const host = hostOrThrow({ body: spot.body }, now);
  const here = toBodyArm(runtime.from, basis, basis, spot.body, host.state);
  const headingRad = skyPoseFromBodyArm(here, spot).azimuthRad;

  let playing: ClipData | null = arrivalClip(
    runtime.from,
    spot,
    pointLocalM,
    headingRad,
    runtime.fovYRad,
    ctxAt(ARRIVAL_APPROACH_SEC * 1000),
  );
  yield* put(updateSelectionFocus({ type: 'body', id: spot.body }, 'cut'));
  yield* put(clipStarted({ data: playing, frame: orientation }));
  try {
    let standing = false;
    while (true) {
      const { exit, commit } = yield* race({
        exit: take(exitTakeover),
        commit: take(commitCameraPose),
      });
      if (commit !== undefined) {
        // The arrival's own regime edges commit body and world frames on the way down.
        if (isSkyArm(commit.payload)) standing = true;
        else if (standing) return;
        continue;
      }
      if (exit?.payload?.restore !== true) return;
      yield* put(updateSelectionFocus(restore.focus, 'cut'));
      const { from } = yield* call(liveCameraRuntimeSaga);
      playing = returnClip(from, restore.base, now);
      yield* put(clipStarted({ data: playing, frame: orientation }));
      // A clip delivers its framing, so the restored focus owes no follow approach after it.
      yield* race({ ended: take(clipEnded), replaced: take(clipStarted) });
      playing = null;
      return;
    }
  } finally {
    // Ended early (preempted, or a plain exit mid-flight): our clip must not land the sky
    // under whatever comes next.
    const clip = yield* select((state: RootState) => state.camera.clip);
    if (playing !== null && clip?.data === playing) yield* put(clipEnded());
  }
}
