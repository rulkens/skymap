import { describe, expect, it } from 'vitest';

import { blitChartsExact } from '../../../../tools/scene-recon/atlas/blitChartsExact';
import type { AtlasImage } from '../../../../tools/scene-recon/@types/AtlasImage';
import type { ChartPlacement } from '../../../../tools/scene-recon/@types/ChartPlacement';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';
import type { PackedVertex } from '../../../../tools/scene-recon/@types/PackedVertex';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const SOURCE_SIZE_PX = 8;
const DEST_SIZE_PX = 16;

function sourceImage(): AtlasImage {
  const rgb = new Uint8Array(SOURCE_SIZE_PX * SOURCE_SIZE_PX * 3);
  for (let k = 0; k < SOURCE_SIZE_PX * SOURCE_SIZE_PX; k++) {
    rgb[3 * k] = k;
    rgb[3 * k + 1] = 255 - k;
    rgb[3 * k + 2] = (k * 3) % 256;
  }
  return { sizePx: SOURCE_SIZE_PX, rgb };
}

function vertex(xref: number, uvPx: Vec2): PackedVertex {
  return { xref, uvPx, chartIndex: 0, atlasIndex: 0 };
}

// One chart, turned once (turns: 1), integer offset chosen so R(-1)·(d - offset) lands on
// non-negative source coordinates for the triangle's interior.
function packedTriangle(): PackedAtlas {
  const vertices = [vertex(0, [4, 4]), vertex(1, [12, 4]), vertex(2, [4, 12])];
  return { chartCount: 1, vertices, indices: new Uint32Array([0, 1, 2]) };
}

describe('blitChartsExact', () => {
  it('reproduces the source texels', () => {
    const placement: ChartPlacement = { turns: 1, mirrorX: false, scale: 1, offsetPx: [13, 2] };
    const { atlas } = blitChartsExact(sourceImage(), packedTriangle(), [placement], DEST_SIZE_PX);

    // Destination texel (5,5), centre (5.5,5.5): R(3)·((5.5,5.5) - (13,2)) = R(3)·(-7.5,3.5) =
    // (3.5, 7.5) — source texel (3,7), index 59.
    const destOffset = (5 * DEST_SIZE_PX + 5) * 3;
    expect([atlas.rgb[destOffset], atlas.rgb[destOffset + 1], atlas.rgb[destOffset + 2]]).toEqual([
      59,
      255 - 59,
      (59 * 3) % 256,
    ]);
  });

  it('throws when a placement lands off a texel centre', () => {
    // A half-texel offset shifts every destination texel centre off the source's texel grid.
    const placement: ChartPlacement = { turns: 1, mirrorX: false, scale: 1, offsetPx: [13.5, 2] };
    expect(() =>
      blitChartsExact(sourceImage(), packedTriangle(), [placement], DEST_SIZE_PX),
    ).toThrow();
  });
});
