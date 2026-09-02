/**
 * applyFocusedBodyPivot — the shared pivot-pin that re-centres a produced pose
 * on the focused body.
 *
 * This is the single site that un-braids body focus into 'the body owns the
 * pivot; the winning driver owns the orbit terms'. It is what stops a focused
 * body drifting out from under an orbit drag (the drag pose froze its target at
 * gesture start while the body kept moving), and what lets auto-rotate spin
 * around the live body.
 */

import { describe, it, expect } from 'vitest';

import { applyFocusedBodyPivot } from '../../../../src/services/engine/camera/applyFocusedBodyPivot';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { worldArmOf } from '../../../fixtures/worldArmOf';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Two instants far enough apart that Earth has visibly moved along its orbit.
const SIM_A = CONST_J2000 + 3652.5; // ~10 years past epoch
const SIM_B = SIM_A + 30; // one month later — the body has moved

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusM: 6371000,
};

// A drag-style pose whose target is a FROZEN point (what orbitDrag produced from
// the gesture-start cam.target) — the pin must overwrite it with the live body.
const DRAG_POSE: CameraPose = { target: [7, 7, 7], yaw: 0.9, pitch: -0.1, distance: 200 };
const DRAG_FRAMED = absoluteArm(DRAG_POSE);

// No strafe (the common case) — a zero world-frame offset.
const NO_PAN: Vec3 = [0, 0, 0];

describe('applyFocusedBodyPivot', () => {
  it('pins the target to the live body while keeping the orbit terms (no drift)', () => {
    const posA = deriveBodyStates(SIM_A).get('earth')!.positionMpc;
    const posB = deriveBodyStates(SIM_B).get('earth')!.positionMpc;
    // Precondition for the test to mean anything: the body actually moved.
    expect(posA).not.toEqual(posB);

    const pinnedA = worldArmOf(applyFocusedBodyPivot(DRAG_FRAMED, true, EARTH_ROW, SIM_A, NO_PAN));
    const pinnedB = worldArmOf(applyFocusedBodyPivot(DRAG_FRAMED, true, EARTH_ROW, SIM_B, NO_PAN));

    // The pivot TRACKS the body across frames — the drift bug was the pivot
    // staying at the frozen DRAG_POSE.target while the body moved.
    expect(pinnedA.target).toEqual(posA);
    expect(pinnedB.target).toEqual(posB);
    expect(pinnedA.target).not.toEqual(DRAG_POSE.target);

    // Orbit terms are the driver's, untouched.
    expect(pinnedA.yaw).toBe(DRAG_POSE.yaw);
    expect(pinnedA.pitch).toBe(DRAG_POSE.pitch);
    expect(pinnedA.distance).toBe(DRAG_POSE.distance);
  });

  it('adds the world-frame pan offset to the body pivot, and it rides the body across frames', () => {
    // A right-drag strafe shifts the pivot to bodyPosition + offset; the offset is
    // a fixed world-frame vector, so as the body moves the shifted pivot tracks it.
    const offset: Vec3 = [10, -20, 30];
    const posA = deriveBodyStates(SIM_A).get('earth')!.positionMpc;
    const posB = deriveBodyStates(SIM_B).get('earth')!.positionMpc;

    const pinnedA = worldArmOf(applyFocusedBodyPivot(DRAG_FRAMED, true, EARTH_ROW, SIM_A, offset));
    const pinnedB = worldArmOf(applyFocusedBodyPivot(DRAG_FRAMED, true, EARTH_ROW, SIM_B, offset));

    expect(pinnedA.target).toEqual([posA[0] + 10, posA[1] - 20, posA[2] + 30]);
    // Offset survives body motion: the shift from the live body is the SAME vector.
    expect([
      pinnedB.target[0] - posB[0],
      pinnedB.target[1] - posB[1],
      pinnedB.target[2] - posB[2],
    ]).toEqual([10, -20, 30]);
  });

  it('is a pass-through for drivers that opt out of the pin (clip / tween)', () => {
    const result = applyFocusedBodyPivot(DRAG_FRAMED, false, EARTH_ROW, SIM_A, NO_PAN);
    expect(result).toBe(DRAG_FRAMED); // same reference — no rewrite
  });

  it('is a pass-through when the focus is not a body', () => {
    expect(applyFocusedBodyPivot(DRAG_FRAMED, true, null, SIM_A, NO_PAN)).toBe(DRAG_FRAMED);
    expect(applyFocusedBodyPivot(DRAG_FRAMED, true, { type: 'milkyWay' }, SIM_A, NO_PAN)).toBe(
      DRAG_FRAMED,
    );
  });
});
