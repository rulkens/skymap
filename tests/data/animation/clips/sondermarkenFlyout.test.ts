/**
 * sondermarkenFlyout — the clip must open exactly on the linked pose and end
 * its tilt looking straight down: a sign slip or a skipped Earth rotation
 * leaves either end plausible-looking but wrong.
 */

import { describe, it, expect } from 'vitest';
import {
  sondermarkenFlyout,
  SONDERMARKEN_POSE,
} from '../../../../src/data/animation/clips/sondermarkenFlyout';
import { evaluateClip } from '../../../../src/services/engine/camera/evaluateClip';
import { resolveClipFoci } from '../../../../src/services/engine/animation/resolveClipFoci';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { decodeFramedPose } from '../../../../src/utils/url/decodeFramedPose';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { SelectionResolver } from '../../../../src/@types/engine/selection/SelectionResolver';

const BASIS = ORIENTATION_FRAMES.ecliptic;
// aimAlong names no subject, so the resolver is never asked.
const NO_SELECTION = {} as SelectionResolver;
const SIM_DAYS = CONST_J2000 + 123.4;

/** Eye in Earth's body-fixed metres, and the view direction in world. */
function eyeAndView(pose: CameraPose) {
  const earth = deriveBodyStates(SIM_DAYS).get('earth')!;
  const toEye = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), BASIS);
  const eyeWorldM = [0, 1, 2].map(
    (i) =>
      (pose.target[i]! + pose.distance * toEye[i]! - earth.positionMpc[i]!) / SCALE_UNITS.M_TO_MPC,
  );
  // World to body-fixed is the transpose of the body's orientation.
  const o = earth.orientation;
  const eyeLocalM = [0, 1, 2].map(
    (c) => o[c * 3]! * eyeWorldM[0]! + o[c * 3 + 1]! * eyeWorldM[1]! + o[c * 3 + 2]! * eyeWorldM[2]!,
  );
  const view: Vec3 = [-toEye[0], -toEye[1], -toEye[2]];
  return { eyeLocalM, view, earth };
}

describe('sondermarkenFlyout', () => {
  const clip = sondermarkenFlyout(SIM_DAYS);

  it('opens on the linked pose: same eye, same sightline', () => {
    const framed = decodeFramedPose(SONDERMARKEN_POSE)!;
    const pose = framed.pose as { eyeRelAnchorM: Vec3; basisLocal: number[] };
    const { eyeLocalM, view, earth } = eyeAndView(clip.data.start as CameraPose);
    for (let i = 0; i < 3; i++) expect(eyeLocalM[i]!).toBeCloseTo(pose.eyeRelAnchorM[i]!, -1);
    const forward = rotateVec3ByTightMat3(
      [pose.basisLocal[6]!, pose.basisLocal[7]!, pose.basisLocal[8]!],
      earth.orientation,
    );
    for (let i = 0; i < 3; i++) expect(view[i]).toBeCloseTo(forward[i]!, 6);
  });

  it('ends the tilt looking straight down, from above the ground', () => {
    // aimAlong resolves to angles at play time, as watchClipSaga does it.
    const start = clip.data.start as CameraPose;
    const resolved = resolveClipFoci(clip.data, NO_SELECTION, 1, start, SIM_DAYS, BASIS);
    const pose = evaluateClip(resolved, 30, BASIS);
    const { eyeLocalM, view, earth } = eyeAndView(pose);
    const r = Math.hypot(...eyeLocalM);
    const upWorld = rotateVec3ByTightMat3(
      [eyeLocalM[0]! / r, eyeLocalM[1]! / r, eyeLocalM[2]! / r],
      earth.orientation,
    );
    expect(r).toBeGreaterThan(6_371_000 + 1000);
    for (let i = 0; i < 3; i++) expect(view[i]).toBeCloseTo(-upWorld[i]!, 3);
  });
});
