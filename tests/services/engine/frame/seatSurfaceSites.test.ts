import { describe, expect, it } from 'vitest';
import { seatSurfaceSites } from '../../../../src/services/engine/frame/seatSurfaceSites';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { PositionedId } from '../../../../src/@types/scene/PositionedId';

const base = deriveBodyStates(CONST_J2000 + 3);
const CURIOSITY = 'curiosity' as PositionedId;
const PERSEVERANCE = 'perseverance' as PositionedId;

function marsDistanceM(states: ReadonlyMap<PositionedId, BodyState>, id: PositionedId): number {
  const [x, y, z] = states.get(id)!.positionMpc;
  const [hx, hy, hz] = states.get('mars' as PositionedId)!.positionMpc;
  return Math.hypot(x - hx, y - hy, z - hz) / SCALE_UNITS.M_TO_MPC;
}

describe('seatSurfaceSites', () => {
  // A dropped sign or unit, or an offset leaking to every site, would go unseen on screen.
  it('lifts only the named site, by its offset, away from its host', () => {
    const seated = seatSurfaceSites(base, { curiosity: 0.1 });
    expect(marsDistanceM(seated, CURIOSITY) - marsDistanceM(base, CURIOSITY)).toBeCloseTo(0.1, 3);
    expect(seated.get(CURIOSITY)!.orientation).toBe(base.get(CURIOSITY)!.orientation);
    expect(seated.get(PERSEVERANCE)).toBe(base.get(PERSEVERANCE));
  });
});
