import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { CameraBasis } from '../../../../tools/mcpm-workbench/src/render/cameraBasis';
import { screenToRay } from '../../../../tools/mcpm-workbench/src/gizmo/screenToRay';

// Identity basis: right=+x, up=+y, forward=+z — keeps the hand-computed
// cases below arithmetic, not a re-derivation of the formula under test.
const BASIS: CameraBasis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] };
const EYE: Vec3 = [2, -1, 5];

describe('screenToRay', () => {
  it('at ndc [0,0] points along the basis forward', () => {
    const ray = screenToRay(EYE, BASIS, Math.PI / 2, 1, [0, 0]);
    expect(ray.origin).toEqual(EYE);
    expect(ray.dir[0]).toBeCloseTo(0, 12);
    expect(ray.dir[1]).toBeCloseTo(0, 12);
    expect(ray.dir[2]).toBeCloseTo(1, 12);
  });

  it('at an off-center ndc matches a hand-computed direction', () => {
    // fovY=90° ⇒ tan(fovY/2)=1; aspect=1; ndc=[1,1].
    //   dir_unnorm = forward + right·1·1·1 + up·1·1 = [0,0,1]+[1,0,0]+[0,1,0] = [1,1,1]
    //   |[1,1,1]| = sqrt(3) ⇒ dir = [1,1,1]/sqrt(3) ≈ [0.57735, 0.57735, 0.57735]
    const ray = screenToRay(EYE, BASIS, Math.PI / 2, 1, [1, 1]);
    const expected = 1 / Math.sqrt(3);
    expect(ray.dir[0]).toBeCloseTo(expected, 12);
    expect(ray.dir[1]).toBeCloseTo(expected, 12);
    expect(ray.dir[2]).toBeCloseTo(expected, 12);
  });
});
