import { describe, expect, it } from 'vitest';

import { latticeHeightSample } from '../../../src/utils/scene/latticeHeightSample';

/**
 * A deliberately NON-linear post field: a linear one is reproduced exactly by
 * bilinear interpolation at every stride, so it could not tell an interpolated
 * sample from a snapped one — which is the whole distinction R14 turned the
 * edge collapse into.
 */
const postM = (col: number, row: number): number => col * col + 3 * row;

/**
 * The cases the vertex stage puts through this sampler: its own lattice, an
 * inherited (coarser) one, and an edge whose neighbour's lattice is one level
 * coarser. Each must land on the same value the NEIGHBOUR sampling its own
 * lattice computes, or the edge cracks.
 */
describe('latticeHeightSample', () => {
  it('returns the post itself where the lattice is the leaf’s own', () => {
    // cells = 128 at n = 64: every template vertex lands on an even post.
    for (const i of [0, 1, 17, 64]) {
      expect(latticeHeightSample(postM, [(i * 128) / 64, 0], 1, 128)).toBe(postM(2 * i, 0));
    }
  });

  it('interpolates between ancestor posts on an inherited lattice', () => {
    // levelDelta 2 → cells = 32 at n = 64: odd template vertices fall halfway
    // between two ancestor posts. i = 5 → p = 2.5, row 1.5.
    const want = 0.25 * (postM(2, 1) + postM(3, 1) + postM(2, 2) + postM(3, 2));
    expect(latticeHeightSample(postM, [2.5, 1.5], 1, 32)).toBeCloseTo(want, 12);
  });

  it('averages the flanking even posts at stride 2', () => {
    // levelDelta 1 → cells = 64 at n = 64: odd vertices sit on odd posts, which
    // the one-level-coarser neighbour has no post for — stride 2 reproduces
    // exactly what IT computes there.
    expect(latticeHeightSample(postM, [3, 0], 2, 64)).toBeCloseTo(
      (postM(2, 0) + postM(4, 0)) / 2,
      12,
    );
    // An even post is already on the coarse lattice: doubling must not move it.
    // On a leaf drawing its OWN tile (cells = 128 at n = 64) EVERY template
    // vertex is even, so the whole edge is a no-op — and correct, since the
    // one-level-coarser neighbour's posts are exactly those even ones.
    expect(latticeHeightSample(postM, [4, 0], 2, 128)).toBe(postM(4, 0));
  });

  it('clamps the doubled stride to the sub-rect', () => {
    // levelDelta 7 → cells = 1: the sub-rect is one cell, so stride 2 would
    // read post 2, which belongs to the next leaf. Clamped, the sample is the
    // leaf's own bilinear value between posts 0 and 1.
    expect(latticeHeightSample(postM, [0.5, 0], 2, 1)).toBeCloseTo(
      (postM(0, 0) + postM(1, 0)) / 2,
      12,
    );
  });
});
