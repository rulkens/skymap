import { describe, expect, it } from 'vitest';

import { chartPlacements } from '../../../../tools/scene-recon/atlas/chartPlacements';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';
import type { PackedVertex } from '../../../../tools/scene-recon/@types/PackedVertex';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const SOURCE_SIZE_PX = 8;
// A 4-corner square at source texels (0,0)-(8,8), xref 0..3, normalized to 0..1.
const SOURCE_UVS = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

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
      sizePx: 64,
      chartCount: 2,
      vertices: [...chart0, ...chart1],
      indices: new Uint32Array(),
    };

    const [p0, p1] = chartPlacements(packed, SOURCE_UVS, SOURCE_SIZE_PX, 1);

    expect(p0).toEqual({ turns: 0, scale: 1, offsetPx: [10, 20] });
    expect(p1).toEqual({ turns: 1, scale: 1, offsetPx: [5, 7] });
  });

  it('folds the scale into the placement', () => {
    // Same square, unturned, at scale 0.5: source texels halve to (0,0)-(4,4), offset [3, 5].
    const chart0: PackedVertex[] = [
      vertex(0, [3, 5], 0),
      vertex(1, [7, 5], 0),
      vertex(2, [7, 9], 0),
      vertex(3, [3, 9], 0),
    ];

    const packed: PackedAtlas = {
      sizePx: 32,
      chartCount: 1,
      vertices: chart0,
      indices: new Uint32Array(),
    };

    const [p0] = chartPlacements(packed, SOURCE_UVS, SOURCE_SIZE_PX, 0.5);

    expect(p0).toEqual({ turns: 0, scale: 0.5, offsetPx: [3, 5] });
  });
});
