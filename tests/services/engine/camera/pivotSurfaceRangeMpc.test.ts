/**
 * pivotSurfaceRangeMpc — the frame, not the focus, decides whether the pivot's
 * radius still has to come off the world distance. A body arm's world pose
 * already ranges to the ground, so subtracting there drove the range to zero or
 * below: the scale bar froze and the near-field bracket collapsed.
 */

import { describe, it, expect } from 'vitest';

import { pivotSurfaceRangeMpc } from '../../../../src/services/engine/camera/pivotSurfaceRangeMpc';
import { pivotRadiusMpc } from '../../../../src/services/engine/camera/pivotRadiusMpc';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { earthArm } from '../../../fixtures/earthArm';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const EARTH_FOCUS: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
};

const POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 100 };
const EARTH_RADIUS_MPC = pivotRadiusMpc(EARTH_FOCUS)!;
const ALTITUDE_MPC = 100 * SCALE_UNITS.KM_TO_MPC;

describe('pivotSurfaceRangeMpc', () => {
  it('takes the focused body’s radius off the absolute arm’s centre distance', () => {
    const range = pivotSurfaceRangeMpc(
      absoluteArm(POSE),
      EARTH_RADIUS_MPC + ALTITUDE_MPC,
      EARTH_FOCUS,
    );
    expect(range).toBeCloseTo(ALTITUDE_MPC, 20);
  });

  it('passes the body arm’s distance through — it already ranges to the ground', () => {
    const range = pivotSurfaceRangeMpc(earthArm(1.5), ALTITUDE_MPC, EARTH_FOCUS);
    expect(range).toBe(ALTITUDE_MPC);
  });

  it('passes the absolute arm’s distance through when nothing is focused', () => {
    expect(pivotSurfaceRangeMpc(absoluteArm(POSE), 42, null)).toBe(42);
  });
});
