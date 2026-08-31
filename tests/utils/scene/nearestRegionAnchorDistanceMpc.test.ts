import { describe, it, expect } from 'vitest';

import { nearestRegionAnchorDistanceMpc } from '../../../src/utils/scene/nearestRegionAnchorDistanceMpc';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const PC = SCALE_UNITS.PC_TO_MPC;
const STATES = deriveBodyStates(CONST_J2000);
const SGR_A_STAR_POS = STATES.get('sgr-a-star')!.positionMpc;

describe('nearestRegionAnchorDistanceMpc', () => {
  it('reads the distance to Sgr A*, not the ~8.2 kpc origin distance, near the galactic centre', () => {
    // 100 pc from Sgr A* along its own local x-axis — far short of the Sun's
    // ~8178 pc, which raw hypot(camPos) would report instead.
    const camPos: Vec3 = [SGR_A_STAR_POS[0] + 100 * PC, SGR_A_STAR_POS[1], SGR_A_STAR_POS[2]];
    const result = nearestRegionAnchorDistanceMpc(camPos, STATES);
    expect(result / PC).toBeCloseTo(100, 6);
    expect(result).toBeLessThan(Math.hypot(camPos[0], camPos[1], camPos[2]) / 2);
  });

  it('falls back to the origin distance once every anchor is farther than it', () => {
    // Straight out from the Sun, directly AWAY from Sgr A*: the Sun (== the
    // origin) sits at exactly 5 Mpc, while Sgr A* sits at 5 Mpc plus its own
    // ~8.2 kpc offset — strictly farther — so the Sun anchor is the nearest.
    const gcMagMpc = Math.hypot(SGR_A_STAR_POS[0], SGR_A_STAR_POS[1], SGR_A_STAR_POS[2]);
    const camPos: Vec3 = [
      (-SGR_A_STAR_POS[0] / gcMagMpc) * 5,
      (-SGR_A_STAR_POS[1] / gcMagMpc) * 5,
      (-SGR_A_STAR_POS[2] / gcMagMpc) * 5,
    ];
    expect(nearestRegionAnchorDistanceMpc(camPos, STATES)).toBeCloseTo(5, 9);
  });

  it('degrades to the origin distance when no anchor resolves (Infinity drops out of the min)', () => {
    const camPos: Vec3 = [8178 * PC + 1 * PC, 0, 0];
    const emptyStates = new Map<string, BodyState>();
    expect(nearestRegionAnchorDistanceMpc(camPos, emptyStates)).toBe(
      Math.hypot(camPos[0], camPos[1], camPos[2]),
    );
  });
});
