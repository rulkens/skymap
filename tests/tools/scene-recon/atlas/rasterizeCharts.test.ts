import { describe, expect, it } from 'vitest';

import { ATLAS_CLAIM } from '../../../../tools/scene-recon/atlas/atlasClaims';
import { rasterizeCharts } from '../../../../tools/scene-recon/atlas/rasterizeCharts';
import type { ChartPlacement } from '../../../../tools/scene-recon/@types/ChartPlacement';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';
import type { PackedVertex } from '../../../../tools/scene-recon/@types/PackedVertex';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const DEST_SIZE_PX = 16;
const IDENTITY: ChartPlacement = { turns: 0, mirrorX: false, scale: 1, offsetPx: [0, 0] };

function vertex(xref: number, uvPx: Vec2, chartIndex: number): PackedVertex {
  return { xref, uvPx, chartIndex };
}

// A right triangle over the destination, unturned: (4,4)-(12,4)-(4,12). Chosen away from the
// atlas border so both an inside-margin and a beyond-margin texel exist off its diagonal edge.
function oneChartTriangle(): PackedAtlas {
  const vertices = [vertex(0, [4, 4], 0), vertex(1, [12, 4], 0), vertex(2, [4, 12], 0)];
  return { chartCount: 1, vertices, indices: new Uint32Array([0, 1, 2]) };
}

describe('rasterizeCharts', () => {
  it('fills the texels a triangle covers and the margin around its edge', () => {
    const packed = oneChartTriangle();
    const visited = new Map<number, Vec2>();
    const claims = rasterizeCharts(packed, [IDENTITY], DEST_SIZE_PX, (destIndex, sx, sy) => {
      visited.set(destIndex, [sx, sy]);
    });

    const index = (x: number, y: number): number => y * DEST_SIZE_PX + x;

    // Interior texel (centre (5.5, 5.5)): well inside the diagonal edge x+y-ish boundary.
    expect(claims[index(5, 5)]).toBe(0);
    expect(visited.get(index(5, 5))).toEqual([5.5, 5.5]); // identity placement: src === dest

    // Texel (3, 5), centre (3.5, 5.5): 0.5 px outside the left edge (x = 4) — within the 0.707 margin.
    expect(claims[index(3, 5)]).toBe(0);

    // Texel (2, 5), centre (2.5, 5.5): 1.5 px outside the same edge — beyond the margin.
    expect(claims[index(2, 5)]).toBe(ATLAS_CLAIM.free);
    expect(visited.has(index(2, 5))).toBe(false);
  });

  it('undoes a mirrored placement after the turn, not before', () => {
    // Source triangle (2,2)-(10,2)-(2,10) mirrored then turned once then shifted by [14, 14]:
    // M(s) = (-x, y), R(1)·(x, y) = (-y, x). Applying the mirror on the wrong side of the turn
    // in the inverse lands on a different source texel, which is the silent-wrong-region bug.
    const vertices = [vertex(0, [12, 12], 0), vertex(1, [12, 4], 0), vertex(2, [4, 12], 0)];
    const packed: PackedAtlas = { chartCount: 1, vertices, indices: new Uint32Array([0, 1, 2]) };
    const mirrored: ChartPlacement = { turns: 1, mirrorX: true, scale: 1, offsetPx: [14, 14] };

    const visited = new Map<number, Vec2>();
    rasterizeCharts(packed, [mirrored], DEST_SIZE_PX, (destIndex, sx, sy) => {
      visited.set(destIndex, [sx, sy]);
    });

    // Dest centre (9.5, 9.5): R(-1)·(9.5 - 14, 9.5 - 14) = (-4.5, 4.5), mirrored back to (4.5, 4.5).
    expect(visited.get(9 * DEST_SIZE_PX + 9)).toEqual([4.5, 4.5]);
  });

  it('throws when two charts claim one texel', () => {
    const vertices = [
      vertex(0, [4, 4], 0),
      vertex(1, [12, 4], 0),
      vertex(2, [4, 12], 0),
      vertex(3, [4, 4], 1),
      vertex(4, [12, 4], 1),
      vertex(5, [4, 12], 1),
    ];
    const packed: PackedAtlas = {
      chartCount: 2,
      vertices,
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };

    expect(() => rasterizeCharts(packed, [IDENTITY, IDENTITY], DEST_SIZE_PX, () => {})).toThrow();
  });
});
