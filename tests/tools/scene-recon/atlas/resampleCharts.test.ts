import { describe, expect, it } from 'vitest';

import { resampleCharts } from '../../../../tools/scene-recon/atlas/resampleCharts';
import type { AtlasImage } from '../../../../tools/scene-recon/@types/AtlasImage';
import type { ChartPlacement } from '../../../../tools/scene-recon/@types/ChartPlacement';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';
import type { PackedVertex } from '../../../../tools/scene-recon/@types/PackedVertex';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const SOURCE_SIZE_PX = 8;
const DEST_SIZE_PX = 16;

// 4x4 shrunk grid, value(x,y) = (y*4+x)*10, all channels equal — one number per texel to check.
function shrunkImage(): AtlasImage {
  const sizePx = 4;
  const rgb = new Uint8Array(sizePx * sizePx * 3);
  for (let y = 0; y < sizePx; y++) {
    for (let x = 0; x < sizePx; x++) {
      const v = (y * sizePx + x) * 10;
      const i = (y * sizePx + x) * 3;
      rgb[i] = v;
      rgb[i + 1] = v;
      rgb[i + 2] = v;
    }
  }
  return { sizePx, rgb };
}

function vertex(xref: number, uvPx: Vec2): PackedVertex {
  return { xref, uvPx, chartIndex: 0, atlasIndex: 0 };
}

function packedTriangle(): PackedAtlas {
  const vertices = [vertex(0, [0, 0]), vertex(1, [8, 0]), vertex(2, [0, 8])];
  return { sizePx: DEST_SIZE_PX, chartCount: 1, vertices, indices: new Uint32Array([0, 1, 2]) };
}

describe('resampleCharts', () => {
  it('samples the shrunk grid, not the source grid', () => {
    // scale 0.5 with a quarter-texel offset — an integer offset degenerates every tap to nearest
    // (the offset a chartPlacements-derived placement always carries); this one exercises the
    // actual bilinear blend and does not coincide with the "forgot the ratio" answer either.
    const placement: ChartPlacement = { turns: 0, scale: 0.5, offsetPx: [0.25, 0.25] };
    const { atlas } = resampleCharts(
      shrunkImage(),
      SOURCE_SIZE_PX,
      packedTriangle(),
      [placement],
      DEST_SIZE_PX,
    );

    // Destination texel (1,1), centre (1.5,1.5): srcXPx = (1.5-0.25)/0.5 = 2.5, scaled by the
    // ratio (4/8=0.5) into the shrunk grid at 1.25 — tap at tx=ty=0.75 between shrunk (0,0)=0,
    // (1,0)=10, (0,1)=40, (1,1)=50 → bilinear 37.5, rounds to 38.
    const destOffset = (1 * DEST_SIZE_PX + 1) * 3;
    expect([atlas.rgb[destOffset], atlas.rgb[destOffset + 1], atlas.rgb[destOffset + 2]]).toEqual([
      38, 38, 38,
    ]);
  });
});
