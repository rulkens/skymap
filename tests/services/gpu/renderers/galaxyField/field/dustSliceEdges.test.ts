/** dustSliceEdges — the dust map's per-frame depth-slice partition. */
import { describe, expect, it } from 'vitest';
import { dustSliceEdges } from '../../../../../../src/services/gpu/renderers/galaxyField/field/dustSliceEdges';

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
    // R = 10, D = 0 → tNear floors to 0.2, tFar = 10, ratio = 50. The edges are
    // 0.2 * 50^(1/4), 0.2 * sqrt(50), 0.2 * 50^(3/4), written out rather than
    // recomputed so a wrong exponent cannot flow into both sides.
    const { t1, t2, t3 } = dustSliceEdges(0, 10);

    expect(t1).toBeCloseTo(0.5318295896945, 12);
    expect(t2).toBeCloseTo(1.4142135623731, 12);
    expect(t3).toBeCloseTo(3.7606030930864, 12);
  });
});
