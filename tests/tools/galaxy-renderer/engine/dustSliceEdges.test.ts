/**
 * dustSliceEdges — the dust map's per-frame depth-slice partition, extracted
 * from drawFrame's per-frame block (see tools/galaxy-renderer/src/engine/dustSliceEdges.ts).
 */
import { describe, expect, it } from 'vitest';
import { dustSliceEdges } from '../../../../tools/galaxy-renderer/src/engine/dustSliceEdges';

describe('dustSliceEdges', () => {
  it('edges are geometrically spaced between tNear and tFar', () => {
    const eyeDistance = 50;
    const reachR = 10;
    const tNear = Math.max(eyeDistance - reachR, 0.02 * reachR);
    const tFar = eyeDistance + reachR;

    const { t1, t2, t3 } = dustSliceEdges(eyeDistance, reachR);

    const ratio1 = t1 / tNear;
    const ratio2 = t2 / t1;
    const ratio3 = t3 / t2;
    const ratio4 = tFar / t3;

    expect(ratio2).toBeCloseTo(ratio1, 12);
    expect(ratio3).toBeCloseTo(ratio1, 12);
    expect(ratio4).toBeCloseTo(ratio1, 12);
  });

  it('the 0.02*R floor keeps tNear off zero when the eye sits at the origin', () => {
    const reachR = 10;
    const { t1, t2, t3 } = dustSliceEdges(0, reachR);

    const tNear = 0.02 * reachR;
    const tFar = 0 + reachR;
    const ratio = tFar / tNear;

    expect(t1).toBeCloseTo(tNear * ratio ** 0.25, 12);
    expect(t2).toBeCloseTo(tNear * ratio ** 0.5, 12);
    expect(t3).toBeCloseTo(tNear * ratio ** 0.75, 12);
    expect(Number.isFinite(t1) && Number.isFinite(t2) && Number.isFinite(t3)).toBe(true);
  });
});
