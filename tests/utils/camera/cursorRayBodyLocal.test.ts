/**
 * cursorRayBodyLocal tests — the body-local cursor ray built from the pose
 * basis and FOV directly (spec §6, no matrix inverse).
 *
 * A non-identity basis (right=+Z, up=+Y, forward=−X world-axis permutation)
 * is used throughout so a bug that reads the wrong `basisLocal` column, or
 * swaps a row for a column, fails these hand-computed expectations instead
 * of accidentally matching them the way an identity basis would.
 *
 * viewport is 800×600 (aspect 4/3) and fovYRad = π/2 (tanHalf = 1), chosen
 * so every expected component reduces to a clean fraction.
 */

import { describe, it, expect } from 'vitest';
import { cursorRayBodyLocal } from '../../../src/utils/camera/cursorRayBodyLocal';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Vec2 } from '../../../src/@types/math/Vec2';

// right=[0,0,1], up=[0,1,0], forward=[-1,0,0] as columns (column-major: cell
// at row r, col c is m[c*3+r]).
const pose: BodyFixedPose = {
  bodyId: 'earth',
  anchorLocalM: [10, 20, 30],
  eyeRelAnchorM: [1, 2, 3],
  basisLocal: [0, 0, 1, 0, 1, 0, -1, 0, 0],
};

const viewportPx: Vec2 = [800, 600];
const fovYRad = Math.PI / 2; // tanHalf = 1

describe('cursorRayBodyLocal', () => {
  it('the screen-centre pixel rays along the pose forward axis', () => {
    const { originM, dir } = cursorRayBodyLocal(pose, [400, 300], viewportPx, fovYRad);
    expect(originM[0]).toBeCloseTo(11, 10);
    expect(originM[1]).toBeCloseTo(22, 10);
    expect(originM[2]).toBeCloseTo(33, 10);
    expect(dir[0]).toBeCloseTo(-1, 10);
    expect(dir[1]).toBeCloseTo(0, 10);
    expect(dir[2]).toBeCloseTo(0, 10);
  });

  it('a pixel at the top edge rays at fovY/2 above forward', () => {
    // CSS pixel y=0 is the top row; ndcY = -((0/600)*2-1) = +1, so the ray
    // tilts toward the pose's +up column.
    const { dir } = cursorRayBodyLocal(pose, [400, 0], viewportPx, fovYRad);
    const s = Math.SQRT1_2; // sin(45°) == cos(45°) at fovY/2 == 45°
    expect(dir[0]).toBeCloseTo(-s, 10);
    expect(dir[1]).toBeCloseTo(s, 10);
    expect(dir[2]).toBeCloseTo(0, 10);
  });

  it('a horizontal edge pixel rays at the aspect-scaled half-angle', () => {
    // Right edge, centre row: ndcX=+1, ndcY=0. If aspect were applied to the
    // wrong axis (or dropped), the horizontal half-angle would come out as
    // fovY/2 (45°) instead of atan(aspect·tan(fovY/2)) (53.13°).
    const { dir } = cursorRayBodyLocal(pose, [800, 300], viewportPx, fovYRad);
    expect(dir[0]).toBeCloseTo(-0.6, 10);
    expect(dir[1]).toBeCloseTo(0, 10);
    expect(dir[2]).toBeCloseTo(0.8, 10);
  });

  it('dir is unit for an off-axis corner pixel', () => {
    const { dir } = cursorRayBodyLocal(pose, [800, 0], viewportPx, fovYRad);
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    expect(len).toBeCloseTo(1, 10);
  });
});
