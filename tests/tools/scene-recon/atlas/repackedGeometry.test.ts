import { describe, expect, it } from 'vitest';

import { repackedGeometry } from '../../../../tools/scene-recon/atlas/repackedGeometry';
import type { ChartPlacement } from '../../../../tools/scene-recon/@types/ChartPlacement';
import type { PackedAtlas } from '../../../../tools/scene-recon/@types/PackedAtlas';
import type { PackedVertex } from '../../../../tools/scene-recon/@types/PackedVertex';
import type { TexturedMeshGeometry } from '../../../../tools/scene-recon/pack/packMeshGlb';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

const SOURCE_SIZE_PX = 8;
const DEST_SIZE_PX = 16;
const IMAGE: TexturedMeshGeometry['image'] = { bytes: new Uint8Array(), mimeType: 'image/jpeg' };

function vertex(xref: number, chartIndex: number): PackedVertex {
  return { xref, uvPx: [0, 0], chartIndex, atlasIndex: chartIndex };
}

// A unit-square quad, split into 2 triangles that xatlas has placed on 2 different charts —
// vertices 0 and 2 sit on the seam and get one packed vertex per chart, per spec §3.
function twoChartQuad(): { source: TexturedMeshGeometry; packed: PackedAtlas } {
  const source: TexturedMeshGeometry = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    image: IMAGE,
  };
  const packed: PackedAtlas = {
    sizePx: DEST_SIZE_PX,
    chartCount: 2,
    vertices: [vertex(0, 0), vertex(1, 0), vertex(2, 0), vertex(0, 1), vertex(2, 1), vertex(3, 1)],
    indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
  };
  return { source, packed };
}

describe('repackedGeometry', () => {
  it('gathers positions through xref and derives UVs from the placement', () => {
    const { source, packed } = twoChartQuad();
    const placements: ChartPlacement[] = [
      { turns: 0, scale: 1, offsetPx: [2, 2] },
      { turns: 1, scale: 1, offsetPx: [10, 2] },
    ];

    const out = repackedGeometry(
      source,
      SOURCE_SIZE_PX,
      packed,
      placements,
      new Map(),
      DEST_SIZE_PX,
      IMAGE,
    );

    // Every output position equals its xref's source position.
    for (let i = 0; i < packed.vertices.length; i++) {
      const xref = packed.vertices[i]!.xref;
      expect([out.positions[3 * i], out.positions[3 * i + 1], out.positions[3 * i + 2]]).toEqual([
        source.positions[3 * xref],
        source.positions[3 * xref + 1],
        source.positions[3 * xref + 2],
      ]);
    }

    // Chart 0 (unturned, offset [2,2]): destPx = sourcePx + [2,2].
    expect([out.uvs[0], out.uvs[1]]).toEqual([2 / 16, 2 / 16]); // xref 0: sourcePx (0,0)
    expect([out.uvs[2], out.uvs[3]]).toEqual([10 / 16, 2 / 16]); // xref 1: sourcePx (8,0)
    expect([out.uvs[4], out.uvs[5]]).toEqual([10 / 16, 10 / 16]); // xref 2: sourcePx (8,8)

    // Chart 1 (turned once, offset [10,2]): destPx = rotate(sourcePx) + [10,2].
    expect([out.uvs[6], out.uvs[7]]).toEqual([10 / 16, 2 / 16]); // xref 0: rotate(0,0) = (0,0)
    expect([out.uvs[8], out.uvs[9]]).toEqual([2 / 16, 10 / 16]); // xref 2: rotate(8,8) = (-8,8)
    expect([out.uvs[10], out.uvs[11]]).toEqual([2 / 16, 2 / 16]); // xref 3: rotate(0,8) = (-8,0)

    expect(Array.from(out.indices)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('gives an orphan vertex its block centre', () => {
    const source: TexturedMeshGeometry = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      image: IMAGE,
    };
    const packed: PackedAtlas = {
      sizePx: DEST_SIZE_PX,
      chartCount: 0,
      vertices: [vertex(0, -1), vertex(1, -1), vertex(2, -1)],
      indices: new Uint32Array([0, 1, 2]),
    };
    const centre: Vec2 = [15, 9];
    const orphanUvPxByVertex = new Map<number, Vec2>([
      [0, centre],
      [1, centre],
      [2, centre],
    ]);

    const out = repackedGeometry(
      source,
      SOURCE_SIZE_PX,
      packed,
      [],
      orphanUvPxByVertex,
      DEST_SIZE_PX,
      IMAGE,
    );

    for (let i = 0; i < 3; i++) {
      expect([out.uvs[2 * i], out.uvs[2 * i + 1]]).toEqual([15 / 16, 9 / 16]);
    }
  });

  it('throws when a face was dropped', () => {
    const { source, packed } = twoChartQuad();
    const droppedFace: PackedAtlas = { ...packed, indices: new Uint32Array([0, 1, 2]) };
    const placements: ChartPlacement[] = [{ turns: 0, scale: 1, offsetPx: [0, 0] }];

    expect(() =>
      repackedGeometry(
        source,
        SOURCE_SIZE_PX,
        droppedFace,
        placements,
        new Map(),
        DEST_SIZE_PX,
        IMAGE,
      ),
    ).toThrow();
  });
});
