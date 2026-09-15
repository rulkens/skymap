/**
 * worldArmUpLevel — adverse 9: cut out of a rover's arm by a focus it cannot
 * serve, the world arm must land on the SELECTED orientation frame's up rather
 * than ride the rover's local horizon to the new focus. Pinned with a driver
 * flying the camera and with none, so the rule cannot drift into follow's.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/services/engine/wiring/reevaluateDemand', () => ({
  reevaluateDemand: vi.fn(),
}));
vi.mock('../../../../src/services/engine/frame/deriveSourceMasks', () => ({
  deriveSourceMasks: () => ({ draw: 0, pick: 0 }),
}));
vi.mock('../../../../src/services/gpu/device', () => ({
  resizeCanvasToDisplay: () => false,
}));

import { foldToWorld } from '../../../../src/services/engine/camera/rungs/foldToWorld';
import { frameKey } from '../../../../src/services/engine/camera/rungs/frameKey';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { setCameraTuning } from '../../../../src/state/camera/cameraSlice';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { frameUp } from '../../../../src/utils/camera/frameUp';
import { imagePlaneBasis } from '../../../../src/utils/camera/imagePlaneBasis';
import { normalize3 } from '../../../../src/utils/math/normalize3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const RUNG_CTX = { bodies: BODIES, poseBasis: B, upBasis: B };

const OPPORTUNITY = {
  frame: { site: 'opportunity' as BodyId },
  pose: { siteId: 'opportunity' as BodyId, headingRad: 0.4, elevationRad: 0.5, rangeM: 60 },
};

/** The drawn screen-up's tilt off the selected frame's pole, in degrees. */
function upTiltDeg(pose: CameraPose): number {
  const eye = eyeMpcOf(pose, B);
  const forward = normalize3([
    pose.target[0]! - eye[0]!,
    pose.target[1]! - eye[1]!,
    pose.target[2]! - eye[2]!,
  ] as Vec3);
  const drawn = imagePlaneBasis(forward, pose.roll ?? 0, frameUp(B)).up;
  const level = imagePlaneBasis(forward, 0, frameUp(B)).up;
  const dot = drawn[0]! * level[0]! + drawn[1]! * level[1]! + drawn[2]! * level[2]!;
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

/** Land the site arm at Challenger Memorial Station, as the ladder fixtures do. */
function standOnOpportunity(): ReturnType<typeof makeCameraSimHarness> {
  const h = makeCameraSimHarness({ focusBody: null, bootHR: null });
  h.seedPose(absoluteArm(foldToWorld(OPPORTUNITY, RUNG_CTX)));
  h.focus('opportunity');
  h.frame(40);
  expect(frameKey(h.store.getState().camera.base.frame)).toBe('site:opportunity');
  return h;
}

/** Run until the arm hands back to the world — the frame the release commits. */
function runToRelease(h: ReturnType<typeof makeCameraSimHarness>): void {
  for (let i = 0; i < 60 && frameKey(h.store.getState().camera.base.frame) !== 'absolute'; i += 1) {
    h.frame();
  }
  expect(frameKey(h.store.getState().camera.base.frame)).toBe('absolute');
}

describe('world-arm up after leaving a site (adverse 9)', () => {
  it('a search focus off the rover arrives at the new body on the frame pole', () => {
    const h = standOnOpportunity();

    h.focus('earth');
    // Release + the follow approach (600 ms) and a settle margin beyond it.
    h.frame(240);

    expect(frameKey(h.store.getState().camera.base.frame)).toBe('absolute');
    expect(h.state.cameraRuntime.register.winner).toBe('followHold');
    expect(upTiltDeg(liveWorldPose(h.state))).toBeLessThan(0.5);
  });

  it('lands level with no driver at all — the release owns it, not the follow row', () => {
    const h = standOnOpportunity();

    // A rover the arm cannot see through Mars: the release cuts out at the
    // surface. Freezing there — focus cleared, so no follow row and no tween —
    // leaves nothing that could level the image afterwards.
    h.focus('curiosity');
    runToRelease(h);
    h.focus(null);
    h.frame(240);

    expect(h.state.cameraRuntime.register.winner).toBe('resting');
    expect(upTiltDeg(liveWorldPose(h.state))).toBeLessThan(0.5);
  });

  it('north-up off carries the site horizon out, roll authority and all (ruling 11)', () => {
    const h = standOnOpportunity();
    h.store.dispatch(setCameraTuning({ northUp: false }));

    h.focus('curiosity');
    runToRelease(h);

    expect(upTiltDeg(liveWorldPose(h.state))).toBeGreaterThan(5);
  });
});
