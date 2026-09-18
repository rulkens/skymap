import { describe, expect, it } from 'vitest';

import { chartPlacements } from '../../../../tools/scene-recon/atlas/chartPlacements';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';
import type { PackedVertex } from '../../../../tools/scene-recon/@types/PackedVertex';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const SOURCE_SIZE_PX = 8;
// A 4-corner square at source texels (0,0)-(8,8), xref 0..3, normalized to 0..1.
const SOURCE_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
// A quarter-square off the UV origin, texels (2,2)-(6,6) — a corner at (0,0) would leave `* scale`
// untested there (0 × scale === 0 either way), so this fixture's corner must move to catch it.
const SOURCE_UVS_OFF_ORIGIN = new Float32Array([0.25, 0.25, 0.75, 0.25, 0.75, 0.75, 0.25, 0.75]);

function vertex(xref: number, uvPx: Vec2, chartIndex: number): PackedVertex {
  return { xref, uvPx, chartIndex, atlasIndex: 0 };
}

describe('chartPlacements', () => {
  it('recovers a 90° turn and an integer offset', () => {
    // Chart 0: unturned square shifted by the exact integer offset [10, 20].
    const chart0: PackedVertex[] = [
      vertex(0, [10, 20], 0),
      vertex(1, [18, 20], 0),
      vertex(2, [18, 28], 0),
      vertex(3, [10, 28], 0),
    ];
    // Chart 1: the same square rotated 90° CCW ((x,y) -> (-y,x)), then shifted by [5.3, 7.3] —
    // the fractional offset xatlas's padding absorbs; the true offset underneath is [5, 7].
    const chart1: PackedVertex[] = [
      vertex(0, [5.3, 7.3], 1),
      vertex(1, [5.3, 15.3], 1),
      vertex(2, [-2.7, 15.3], 1),
      vertex(3, [-2.7, 7.3], 1),
    ];

    const packed: PackedAtlas = {
      chartCount: 2,
      vertices: [...chart0, ...chart1],
      indices: new Uint32Array(),
    };

    const [p0, p1] = chartPlacements(packed, SOURCE_UVS, SOURCE_SIZE_PX, 1);

    expect(p0).toEqual({ turns: 0, scale: 1, offsetPx: [10, 20] });
    expect(p1).toEqual({ turns: 1, scale: 1, offsetPx: [5, 7] });
  });

  it('folds the scale into the placement', () => {
    // Source square (2,2)-(6,6) at scale 0.5 shrinks to (1,1)-(3,3); dest square sized to match
    // (2x2, min corner [3,5]) has zero residual — only a correctly scaled offset gets that.
    const chart0: PackedVertex[] = [
      vertex(0, [3, 5], 0),
      vertex(1, [5, 5], 0),
      vertex(2, [5, 7], 0),
      vertex(3, [3, 7], 0),
    ];

    const packed: PackedAtlas = {
      chartCount: 1,
      vertices: chart0,
      indices: new Uint32Array(),
    };

    const [p0] = chartPlacements(packed, SOURCE_UVS_OFF_ORIGIN, SOURCE_SIZE_PX, 0.5);

    // dMin [3,5] − scaled source min [1,1] = [2,4]; with `* scale` dropped, source min would
    // instead be [2,2] (unscaled), giving offset [1,3] — this fixture tells the two apart.
    expect(p0).toEqual({ turns: 0, scale: 0.5, offsetPx: [2, 4] });
  });

  it('throws when a chart has no member vertices', () => {
    const packed: PackedAtlas = {
      chartCount: 1,
      vertices: [], // chartIndex 0 never appears — no member ever assigned
      indices: new Uint32Array(),
    };

    expect(() => chartPlacements(packed, SOURCE_UVS, SOURCE_SIZE_PX, 1)).toThrow(/chart 0/);
  });

  it('throws when no 90° turn fits the chart', () => {
    // A skewed quad: no rotation by 0/90/180/270° plus a single offset maps the unit square onto
    // this shape, so every turn's residual spread is large — xatlas rotated it off-axis or shrank
    // it past the resolution, and the placement would silently sample the wrong source region.
    const skewed: PackedVertex[] = [
      vertex(0, [0, 0], 0),
      vertex(1, [8, 2], 0),
      vertex(2, [6, 10], 0),
      vertex(3, [-2, 8], 0),
    ];

    const packed: PackedAtlas = {
      chartCount: 1,
      vertices: skewed,
      indices: new Uint32Array(),
    };

    expect(() => chartPlacements(packed, SOURCE_UVS, SOURCE_SIZE_PX, 1)).toThrow(/chart 0/);
  });
});
