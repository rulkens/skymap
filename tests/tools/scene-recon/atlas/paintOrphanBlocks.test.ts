import { describe, expect, it } from 'vitest';

import { ATLAS_CLAIM } from '../../../../tools/scene-recon/atlas/atlasClaims';
import { paintOrphanBlocks } from '../../../../tools/scene-recon/atlas/paintOrphanBlocks';
import type { AtlasImage } from '../../../../tools/scene-recon/@types/AtlasImage';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';

const DEST_SIZE_PX = 32;
const CLAIMED_COLUMNS = 8; // x in [0, 8): a pre-claimed region the search must skip past

function destAtlas(): { atlas: AtlasImage; claims: Int32Array } {
  const claims = new Int32Array(DEST_SIZE_PX * DEST_SIZE_PX).fill(ATLAS_CLAIM.free);
  const rgb = new Uint8Array(DEST_SIZE_PX * DEST_SIZE_PX * 3);
  for (let y = 0; y < DEST_SIZE_PX; y++) {
    for (let x = 0; x < CLAIMED_COLUMNS; x++) {
      const i = y * DEST_SIZE_PX + x;
      claims[i] = 0; // some real chart already owns this region
      rgb[3 * i] = 99;
      rgb[3 * i + 1] = 99;
      rgb[3 * i + 2] = 99;
    }
  }
  return { atlas: { sizePx: DEST_SIZE_PX, rgb }, claims };
}

function sourceImage(): AtlasImage {
  const sizePx = 4;
  const rgb = new Uint8Array(sizePx * sizePx * 3);
  // Texel (2,2) — the one (0.5, 0.5) resolves to — carries a distinct colour.
  const i = (2 * sizePx + 2) * 3;
  rgb[i] = 10;
  rgb[i + 1] = 20;
  rgb[i + 2] = 30;
  return { sizePx, rgb };
}

describe('paintOrphanBlocks', () => {
  it('places a block clear of claimed texels and returns its centre', () => {
    const { atlas, claims } = destAtlas();
    const source = sourceImage();
    // Two vertices, different xref, same source UV — one orphan point, both faces.
    const sourceUvs = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const packed: PackedAtlas = {
      chartCount: 0,
      vertices: [
        { xref: 0, uvPx: [0, 0], chartIndex: -1 },
        { xref: 1, uvPx: [0, 0], chartIndex: -1 },
      ],
      indices: new Uint32Array(),
    };

    const { uvPxByVertex, blocks } = paintOrphanBlocks(atlas, claims, source, packed, sourceUvs);

    expect(blocks).toBe(1);
    // y0=0 is ruled out everywhere (its border runs off the top edge); at y0=6, x0=0 runs off the
    // left edge and x0=6's border reaches into the claimed columns — x0=12 is the first block
    // whose 10x10 neighbourhood is entirely free.
    expect(uvPxByVertex.get(0)).toEqual([15, 9]);
    expect(uvPxByVertex.get(1)).toEqual([15, 9]);

    const at = (x: number, y: number) => {
      const i = y * DEST_SIZE_PX + x;
      return [atlas.rgb[3 * i], atlas.rgb[3 * i + 1], atlas.rgb[3 * i + 2]];
    };

    // Block core carries the source colour and is claimed as an orphan block.
    expect(at(15, 9)).toEqual([10, 20, 30]);
    expect(claims[9 * DEST_SIZE_PX + 15]).toBe(ATLAS_CLAIM.orphan);

    // The pre-claimed region is untouched.
    expect(claims[9 * DEST_SIZE_PX + 4]).toBe(0);
    expect(at(4, 9)).toEqual([99, 99, 99]);

    // The 2 px border around the new block was never claimed.
    expect(claims[9 * DEST_SIZE_PX + 10]).toBe(ATLAS_CLAIM.free);
    expect(claims[9 * DEST_SIZE_PX + 19]).toBe(ATLAS_CLAIM.free);
  });

  it('throws when the atlas has no room', () => {
    const claims = new Int32Array(DEST_SIZE_PX * DEST_SIZE_PX).fill(0); // fully claimed
    const atlas: AtlasImage = {
      sizePx: DEST_SIZE_PX,
      rgb: new Uint8Array(DEST_SIZE_PX * DEST_SIZE_PX * 3),
    };
    const source = sourceImage();
    const sourceUvs = new Float32Array([0.5, 0.5]);
    const packed: PackedAtlas = {
      chartCount: 0,
      vertices: [{ xref: 0, uvPx: [0, 0], chartIndex: -1 }],
      indices: new Uint32Array(),
    };

    expect(() => paintOrphanBlocks(atlas, claims, source, packed, sourceUvs)).toThrow();
  });
});
