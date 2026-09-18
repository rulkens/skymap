/**
 * Vertices xatlas placed nowhere (`atlasIndex === -1`) come from faces whose three UVs coincide —
 * OpenMVS's "no camera saw this face" fallback (one point, 3,801 faces, on mesh-cropped). Each
 * distinct source UV gets a flat block of its own colour so no face is ever dropped.
 */
import { ATLAS_CLAIM } from './atlasClaims';
import type { AtlasImage } from '../@types/AtlasImage';
import type { PackedAtlas } from '../@types/PackedAtlas';
import type { Vec2 } from '../../../src/@types/math/Vec2';

const ORPHAN_BLOCK_PX = 6;
const ORPHAN_BLOCK_BORDER_PX = 2;

type OrphanPoint = { readonly uv: Vec2; readonly vertices: number[] };

/** Nearest source texel is enough — a flat block hides any sub-texel drift. */
function nearestSourceTexel(source: AtlasImage, [u, v]: Vec2): [number, number, number] {
  const last = source.sizePx - 1;
  const sx = Math.min(last, Math.max(0, Math.floor(u * source.sizePx)));
  const sy = Math.min(last, Math.max(0, Math.floor(v * source.sizePx)));
  const i = (sy * source.sizePx + sx) * 3;
  return [source.rgb[i]!, source.rgb[i + 1]!, source.rgb[i + 2]!];
}

/** A candidate block is usable only when its border is also untouched, so no future block ever
 *  abuts a claimed texel — the stride below then naturally leaves that border between blocks. */
function blockIsFree(claims: Int32Array, destSizePx: number, x0: number, y0: number): boolean {
  const lo = -ORPHAN_BLOCK_BORDER_PX;
  const hi = ORPHAN_BLOCK_PX + ORPHAN_BLOCK_BORDER_PX;
  if (x0 + lo < 0 || y0 + lo < 0 || x0 + hi > destSizePx || y0 + hi > destSizePx) return false;
  for (let y = y0 + lo; y < y0 + hi; y++) {
    for (let x = x0 + lo; x < x0 + hi; x++) {
      if (claims[y * destSizePx + x] !== ATLAS_CLAIM.free) return false;
    }
  }
  return true;
}

export function paintOrphanBlocks(
  atlas: AtlasImage,
  claims: Int32Array,
  source: AtlasImage,
  packed: PackedAtlas,
  sourceUvs: Float32Array,
): { uvPxByVertex: Map<number, Vec2>; blocks: number } {
  const destSizePx = atlas.sizePx;
  const pointsByKey = new Map<string, OrphanPoint>();

  packed.vertices.forEach((v, i) => {
    if (v.chartIndex >= 0) return;
    const uv: Vec2 = [sourceUvs[2 * v.xref]!, sourceUvs[2 * v.xref + 1]!];
    const key = `${uv[0]}:${uv[1]}`;
    const point = pointsByKey.get(key);
    if (point) point.vertices.push(i);
    else pointsByKey.set(key, { uv, vertices: [i] });
  });

  const uvPxByVertex = new Map<number, Vec2>();

  for (const { uv, vertices } of pointsByKey.values()) {
    let placed = false;
    for (let y0 = 0; y0 <= destSizePx - ORPHAN_BLOCK_PX && !placed; y0 += ORPHAN_BLOCK_PX) {
      for (let x0 = 0; x0 <= destSizePx - ORPHAN_BLOCK_PX && !placed; x0 += ORPHAN_BLOCK_PX) {
        if (!blockIsFree(claims, destSizePx, x0, y0)) continue;

        const color = nearestSourceTexel(source, uv);
        for (let dy = 0; dy < ORPHAN_BLOCK_PX; dy++) {
          for (let dx = 0; dx < ORPHAN_BLOCK_PX; dx++) {
            const i = (y0 + dy) * destSizePx + (x0 + dx);
            claims[i] = ATLAS_CLAIM.orphan;
            atlas.rgb[3 * i] = color[0];
            atlas.rgb[3 * i + 1] = color[1];
            atlas.rgb[3 * i + 2] = color[2];
          }
        }

        const centre: Vec2 = [x0 + ORPHAN_BLOCK_PX / 2, y0 + ORPHAN_BLOCK_PX / 2];
        for (const i of vertices) uvPxByVertex.set(i, centre);
        placed = true;
      }
    }
    if (!placed) throw new Error(`paintOrphanBlocks: no free block left for an orphan point`);
  }

  return { uvPxByVertex, blocks: pointsByKey.size };
}
