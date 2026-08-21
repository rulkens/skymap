/**
 * surfaceFollowEngaged — unit tests for the surface-fixed-follow hysteresis
 * gate (spec §4.6). The two-threshold design exists specifically so a camera
 * parked near the switch altitude doesn't flicker the mode every frame; the
 * hysteresis-band test is the one that would catch a regression to a single
 * threshold.
 */

import { describe, it, expect } from 'vitest';

import { surfaceFollowEngaged } from '../../../src/utils/camera/surfaceFollowEngaged';

const ENGAGE_AT_MPC = 2;
const DISENGAGE_AT_MPC = 4;

describe('surfaceFollowEngaged', () => {
  it('engages when altitude drops to the engage threshold', () => {
    expect(surfaceFollowEngaged(false, ENGAGE_AT_MPC, ENGAGE_AT_MPC, DISENGAGE_AT_MPC)).toBe(true);
  });

  it('holds engaged through the hysteresis band', () => {
    // Strictly between the two thresholds: a single-threshold model would
    // disengage immediately on any altitude above the engage point, which is
    // exactly the flicker the two-threshold design exists to prevent.
    const midBand = (ENGAGE_AT_MPC + DISENGAGE_AT_MPC) / 2;
    expect(surfaceFollowEngaged(true, midBand, ENGAGE_AT_MPC, DISENGAGE_AT_MPC)).toBe(true);
  });

  it('disengages at the disengage threshold', () => {
    expect(surfaceFollowEngaged(true, DISENGAGE_AT_MPC, ENGAGE_AT_MPC, DISENGAGE_AT_MPC)).toBe(
      false,
    );
  });

  it('stays disengaged above the engage threshold', () => {
    expect(surfaceFollowEngaged(false, ENGAGE_AT_MPC + 0.5, ENGAGE_AT_MPC, DISENGAGE_AT_MPC)).toBe(
      false,
    );
  });
});
