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
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

// Two instants far enough apart that Earth has visibly moved along its orbit.
const SIM_A = CONST_J2000 + 3652.5; // ~10 years past epoch
const SIM_B = SIM_A + 30; // one month later — the body has moved

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusKm: 6371,
};

// A drag-style pose whose target is a FROZEN point (what orbitDrag produced from
// the gesture-start cam.target) — the pin must overwrite it with the live body.
const DRAG_POSE: CameraPose = { target: [7, 7, 7], yaw: 0.9, pitch: -0.1, distance: 200 };

describe('applyFocusedBodyPivot', () => {
  it('pins the target to the live body while keeping the orbit terms (no drift)', () => {
    const posA = deriveBodyStates(SIM_A).get('earth')!.positionMpc;
    const posB = deriveBodyStates(SIM_B).get('earth')!.positionMpc;
    // Precondition for the test to mean anything: the body actually moved.
    expect(posA).not.toEqual(posB);

    const pinnedA = applyFocusedBodyPivot(DRAG_POSE, true, EARTH_ROW, SIM_A);
    const pinnedB = applyFocusedBodyPivot(DRAG_POSE, true, EARTH_ROW, SIM_B);

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

  it('is a pass-through for drivers that opt out of the pin (clip / tween)', () => {
    const result = applyFocusedBodyPivot(DRAG_POSE, false, EARTH_ROW, SIM_A);
    expect(result).toBe(DRAG_POSE); // same reference — no rewrite
  });

  it('is a pass-through when the focus is not a body', () => {
    expect(applyFocusedBodyPivot(DRAG_POSE, true, null, SIM_A)).toBe(DRAG_POSE);
    expect(applyFocusedBodyPivot(DRAG_POSE, true, { type: 'milkyWay' }, SIM_A)).toBe(DRAG_POSE);
  });
});
