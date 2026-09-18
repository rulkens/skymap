/**
 * The source mesh re-indexed onto the packed atlas: xatlas splits vertices along chart seams, so
 * positions are gathered through `xref`, and UVs come from the placements — never from xatlas's
 * own `uvPx`, which still carries the sub-texel residual the bake's rounded placement dropped.
 */
import { rotateTurns } from './rotateTurns';
import type { ChartPlacement } from '../@types/ChartPlacement';
import type { PackedAtlas } from '../@types/PackedAtlas';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { TexturedMeshGeometry } from '../pack/packMeshGlb';

export function repackedGeometry(
  source: TexturedMeshGeometry,
  sourceSizePx: number,
  packed: PackedAtlas,
  placements: readonly ChartPlacement[],
  orphanUvPxByVertex: ReadonlyMap<number, Vec2>,
  destSizePx: number,
  image: TexturedMeshGeometry['image'],
): TexturedMeshGeometry {
  if (packed.indices.length !== source.indices.length) {
    throw new Error(
      `repackedGeometry: face count changed — ${packed.indices.length / 3} vs ${source.indices.length / 3}`,
    );
  }

  const count = packed.vertices.length;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const v = packed.vertices[i]!;
    positions[3 * i] = source.positions[3 * v.xref]!;
    positions[3 * i + 1] = source.positions[3 * v.xref + 1]!;
    positions[3 * i + 2] = source.positions[3 * v.xref + 2]!;

    let destPx: Vec2;
    if (v.chartIndex >= 0) {
      const placement = placements[v.chartIndex]!;
      const sourceX = source.uvs[2 * v.xref]! * sourceSizePx * placement.scale;
      const sourcePx: Vec2 = [
        placement.mirrorX ? -sourceX : sourceX,
        source.uvs[2 * v.xref + 1]! * sourceSizePx * placement.scale,
      ];
      const turned = rotateTurns(sourcePx, placement.turns);
      destPx = [turned[0] + placement.offsetPx[0], turned[1] + placement.offsetPx[1]];
    } else {
      const orphan = orphanUvPxByVertex.get(i);
      if (!orphan) throw new Error(`repackedGeometry: no orphan block for vertex ${i}`);
      destPx = orphan;
    }

    uvs[2 * i] = destPx[0] / destSizePx;
    uvs[2 * i + 1] = destPx[1] / destSizePx;
  }

  return { positions, uvs, indices: packed.indices, image };
}
