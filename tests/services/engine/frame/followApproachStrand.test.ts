/**
 * followApproachStrand — R14-3: with the spin pill on, `autoRotate` (20) used to
 * outrank the single follow row (10), so a body switch never ran its approach —
 * the camera kept the OLD body's distance, which over Saturn is 0.26 R♄, i.e.
 * inside the planet, arm engaged and disengage unreachable. `followApproach`
 * (55) owns the approach window; the spin resumes once it closes. Real runFrame.
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

import { makeCameraSimHarness } from '../../../helpers/camera/makeCameraSimHarness';
import { diveUntilEngaged } from '../../../helpers/camera/diveUntilEngaged';
import { hrOverBody } from '../../../helpers/camera/hrOverBody';
import { readRegister } from '../../../helpers/camera/readRegister';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { liveWorldPose } from '../../../../src/services/engine/helpers/liveWorldPose';
import { setAutoRotate } from '../../../../src/state/camera/cameraSlice';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraSimHarness } from '../../../helpers/camera/CameraSimHarness';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { FramedCameraPose } from '../../../../src/@types/camera/FramedCameraPose';

const SATURN = deriveBodyStates(CONST_J2000).get('saturn')! as BodyState;

/** Turn the spin pill on at the store's own rate (the UI's only lever). */
function spinOn(h: CameraSimHarness): void {
  const { rate } = h.store.getState().camera.autoRotate;
  h.store.dispatch(setAutoRotate({ active: true, rate }));
}

/** The absolute-arm pose as flat numbers: the register across a hand-off frame. */
function armNumbers(pose: FramedCameraPose): readonly number[] {
  if (pose.frame !== 'absolute') throw new Error(`expected an absolute arm, got ${pose.frame}`);
  const p = pose.pose;
  return [...p.target, p.yaw, p.pitch, p.distance, p.roll ?? 0];
}

describe('follow approach under autoRotate (R14-3)', () => {
  it('focusing a body with autoRotate on does not strand the camera inside it', () => {
    const h = makeCameraSimHarness();
    const framingMpc = bodyFocusDistance(
      h.radiusM('saturn') * SCALE_UNITS.M_TO_MPC,
      Math.PI / 3, // the harness FOV, stamped onto the projection every frame
    );

    // The bug's exact gesture: dive into the Earth surface regime, turn the
    // spin pill on, focus Saturn.
    diveUntilEngaged(h);
    spinOn(h);
    h.focus('saturn');

    // 200 frames is 3.2 s — five approach windows, so the arrival below is the
    // steady state, not a frame of the ease.
    for (let i = 0; i < 200; i += 1) {
      h.frame();
      expect(hrOverBody(h.state, SATURN, h.radiusM('saturn'))).toBeGreaterThan(0);
    }

    const arrivedMpc =
      (hrOverBody(h.state, SATURN, h.radiusM('saturn')) + 1) *
      h.radiusM('saturn') *
      SCALE_UNITS.M_TO_MPC;
    // 2 %, not the 1e-3 the un-spun approach lands inside: the edge commit bakes
    // the LAST approach frame, one 16 ms tick short of saturation, and 2.4e-6 of
    // `easeOutCubic` left over a 5000× approach is 1.2 % of the framing distance.
    // The spin then holds that — outside the planet, at the framing distance.
    expect(Math.abs(arrivedMpc - framingMpc) / framingMpc).toBeLessThan(0.02);
  });

  it('the approach hands off to the hold with no jump', () => {
    const h = makeCameraSimHarness();
    h.focus('saturn');

    // Three consecutive registers around the hand-off: two the approach
    // authored, one the hold. There is no commit edge between them — the pair is
    // ONE author (`commitOnEdge`) — so each is that frame's own produce.
    const regs: FramedCameraPose[] = [];
    let held = -1;
    for (let i = 0; i < 120 && held < 0; i += 1) {
      h.frame();
      const { pose, winner } = readRegister(h.state);
      regs.push(pose);
      if (winner === 'followHold') held = regs.length - 1;
    }
    expect(held).toBeGreaterThan(1);

    // `easeOutCubic` decelerates, so the step ACROSS the hand-off can only be
    // smaller than the step before it: the change of author adds no motion of
    // its own. Term by term, target included — the hold reads the same memory,
    // the same base and the same epoch, or one of these steps would blow up.
    const [before, last, first] = [
      armNumbers(regs[held - 2]!),
      armNumbers(regs[held - 1]!),
      armNumbers(regs[held]!),
    ];
    first.forEach((_, k) => {
      const easing = Math.abs(last[k]! - before[k]!);
      expect(Math.abs(first[k]! - last[k]!)).toBeLessThanOrEqual(easing * (1 + 1e-9));
    });
  });

  it('an autoRotate spin resumes after the approach completes', () => {
    const h = makeCameraSimHarness();
    spinOn(h);
    h.focus('saturn');

    h.frame(60); // 960 ms: past the approach window with margin
    expect(readRegister(h.state).winner).toBe('autoRotate');

    const before = liveWorldPose(h.state).yaw;
    h.frame(5);
    expect(Math.abs(liveWorldPose(h.state).yaw - before)).toBeGreaterThan(1e-6);
  });
});
