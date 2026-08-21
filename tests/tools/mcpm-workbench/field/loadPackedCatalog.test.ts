/**
 * loadPackedCatalog — parser against fixture bytes: interleaving of the
 * flat f32 [X, Y, Z, W] layout, and the length-vs-metadata guard.
 */
import { describe, expect, it } from 'vitest';
import { loadPackedCatalog } from '../../../../tools/mcpm-workbench/src/field/loadPackedCatalog';

/** Three hand-built points, W = 4, 8, 12 → mean weight 8. */
function threePointBuffer(): ArrayBuffer {
  // Three points, each [X, Y, Z, W]: (1,2,3,4), (5,6,7,8), (9,10,11,12).
  const flat = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  return flat.buffer;
}

const THREE_POINT_METADATA = 'Number of points = 3\nMean weight = 8\n';

describe('loadPackedCatalog', () => {
  it('parses a flat f32 [X, Y, Z, W] buffer into interleaved positions and weights', () => {
    const { points, declaredCount, declaredMeanWeight } = loadPackedCatalog(
      threePointBuffer(),
      THREE_POINT_METADATA,
    );

    expect(declaredCount).toBe(3);
    expect(declaredMeanWeight).toBe(8);
    expect(points.count).toBe(3);
    expect(Array.from(points.positions)).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
    // Packed W plugs straight into log10StellarMass — deriveAgentWeights's
    // transform runs on it downstream unmodified.
    expect(Array.from(points.log10StellarMass)).toEqual([4, 8, 12]);
  });

  it('rejects a buffer whose length disagrees with the metadata count', () => {
    // Only 2 points' worth of bytes, but the metadata declares 3.
    const shortFlat = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => loadPackedCatalog(shortFlat.buffer, THREE_POINT_METADATA)).toThrow(/2.*3|3.*2/);
  });
});
