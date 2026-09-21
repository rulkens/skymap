/**
 * sampledDepthKmFrame — the `{ sample }` row's depth turned into the pair a
 * fragment unprojects with. Ported from `orbitTrailsPass.test.ts`, which pinned
 * the same expectations inline before the labels pass needed them too.
 */

import { describe, it, expect } from 'vitest';
import { mat4d } from 'wgpu-matrix';

import { sampledDepthKmFrame } from '../../../src/utils/camera/sampledDepthKmFrame';
import { composeBodySlabMvp } from '../../../src/utils/camera/composeBodySlabMvp';
import { narrowMat4 } from '../../../src/utils/math/narrowMat4';
import { makeSlab } from '../../fixtures/makeSlab';

import type { Slab } from '../../../src/@types/engine/frame/Slab';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// The eye in the body's fixed frame — metres, asymmetric so a dropped or
// swapped axis in the km conversion shows up.
const EYE_M: Vec3 = [6.6e6, -1.2e6, 3.4e5];

// INVERTIBLE (makeSlab's default ramp is singular) — the helper inverts it.
function bodyRow(): Slab {
  return makeSlab({
    vp: Float64Array.from([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 5, 6, 7, 1]),
    frame: { kind: 'body-m', bodyId: 'earth' },
  });
}

const POSE_OF = (bodyId: string) =>
  bodyId === 'earth' ? { eyeRelBodyM: EYE_M, basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] } : null;

describe('sampledDepthKmFrame', () => {
  it('km-scales the row’s own f64 vp and eye', () => {
    const row = bodyRow();
    const frame = sampledDepthKmFrame(row, POSE_OF as never);

    const expected = narrowMat4(
      mat4d.inverse(composeBodySlabMvp(row.vp, EYE_M, 1000)) as Float64Array,
    );
    expect(Array.from(frame!.invMvp)).toEqual(Array.from(expected));
    // Metres ÷ 1000: the eye in the same km frame `invMvp` unprojects into.
    expect(frame!.camPosKm).toEqual([6600, -1200, 340]);
  });

  it('is null for no row, a non-body-m row, and a body the pose provider cannot place', () => {
    expect(sampledDepthKmFrame(null, POSE_OF as never)).toBeNull();
    expect(sampledDepthKmFrame(makeSlab(), POSE_OF as never)).toBeNull();
    expect(
      sampledDepthKmFrame(
        makeSlab({ vp: bodyRow().vp, frame: { kind: 'body-m', bodyId: 'sun' } }),
        POSE_OF as never,
      ),
    ).toBeNull();
  });
});
