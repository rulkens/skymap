/**
 * foldBoostIntoSlab — the per-frame cases `slabs.test.ts` cannot reach through `deriveSlabs`:
 * the shipped `RENDER_ORIGIN_MPC` is the zero vector, so NEAR0's origin-relative frame is
 * pinned here against a mocked, non-zero origin.
 */

import { describe, expect, it, vi } from 'vitest';
import { mat4d, vec4d } from 'wgpu-matrix';
import type { FrameBoost } from '../../../src/@types/engine/frame/FrameBoost';
import type { Slab } from '../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { foldBoostIntoSlab } from '../../../src/utils/camera/foldBoostIntoSlab';

vi.mock('../../../src/data/renderOrigin', () => ({ RENDER_ORIGIN_MPC: [5, -3, 2] }));
const ORIGIN: Vec3 = [5, -3, 2];

const BOOST: FrameBoost = {
  shipMpc: [6, -1, 4],
  dir: [2 / 3, -1 / 3, 2 / 3],
  beta: 0.9,
  gamma: 4,
  contraction: true,
  doppler: false,
  headlight: 0,
};

function slab(frame: Slab['frame']): Slab {
  const view = mat4d.lookAt([1, 2, 9], [1, 1, 0], [0, 1, 0]);
  const vp = mat4d.multiply(mat4d.perspective(1, 1.5, 0.01, 100), view) as Float64Array;
  return {
    index: 0,
    near: 0.01,
    far: 100,
    vp,
    frame,
    distanceRangeM: null,
    precision: 'f64',
    reversedZ: false,
  };
}

describe('foldBoostIntoSlab', () => {
  it('folds NEAR0 about the ship less the render origin', () => {
    const near0 = slab({ kind: 'world-mpc', originRelative: true });
    const folded = foldBoostIntoSlab(near0, BOOST, [0, 0, 0], () => undefined);
    const at = (l: number): number[] => [
      ...BOOST.shipMpc.map((s, i) => s + BOOST.dir[i]! * l - ORIGIN[i]!),
      1,
    ];
    const a = vec4d.transformMat4(at(8), folded.vp);
    const b = vec4d.transformMat4(at(2), near0.vp);
    for (let i = 0; i < 4; i += 1) expect(a[i]).toBeCloseTo(b[i]!, 9);
  });

  it('throws for a body row whose host has no orientation', () => {
    const body = slab({ kind: 'body-m', hostId: 'earth' });
    expect(() => foldBoostIntoSlab(body, BOOST, [0, 0, 0], () => undefined)).toThrow(/earth/);
  });
});
