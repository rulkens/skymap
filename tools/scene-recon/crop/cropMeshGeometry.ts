/**
 * The exact cut of a textured mesh by an outline prism (spec §4.6). Most
 * triangles take the bbox reject or the untouched fast path; only boundary
 * triangles are clipped per convex piece. Output vertices weld by `ClipVertex`
 * key, which is what keeps neighbours cutting a shared edge crack-free.
 */
import { clipPolygonByHalfPlane } from './clipPolygonByHalfPlane';
import { insideRing } from './insideRing';
import { segmentsTouch } from './segmentsTouch';
import type { ClipVertex } from '../@types/ClipVertex';
import type { HalfPlane2 } from '../@types/HalfPlane2';
import type { TexturedMeshGeometry } from '../pack/packMeshGlb';
import type { Vec2 } from '../../../src/@types/math/Vec2';

export function cropMeshGeometry(
  geometry: TexturedMeshGeometry,
  ringM: readonly Vec2[],
  pieces: readonly HalfPlane2[][],
): TexturedMeshGeometry {
  const { positions, uvs, indices } = geometry;
  const ringXs = ringM.map(([x]) => x);
  const ringYs = ringM.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...ringXs),
    Math.max(...ringXs),
    Math.min(...ringYs),
    Math.max(...ringYs),
  ];

  const outPositions: number[] = [];
  const outUvs: number[] = [];
  const outIndices: number[] = [];
  const outIndexByKey = new Map<string, number>();
  const emit = (v: ClipVertex): number => {
    let index = outIndexByKey.get(v.key);
    if (index === undefined) {
      index = outIndexByKey.size;
      outIndexByKey.set(v.key, index);
      outPositions.push(...v.positionM);
      outUvs.push(...v.uv);
    }
    return index;
  };
  const sourceVertex = (i: number): ClipVertex => ({
    positionM: [positions[3 * i]!, positions[3 * i + 1]!, positions[3 * i + 2]!],
    uv: [uvs[2 * i]!, uvs[2 * i + 1]!],
    key: `v${i}`,
  });

  for (let t = 0; t < indices.length; t += 3) {
    const corners = [indices[t]!, indices[t + 1]!, indices[t + 2]!].map(sourceVertex);
    const xy = corners.map(({ positionM: [x, y] }): Vec2 => [x, y]);
    if (
      xy.every(([x]) => x < minX) ||
      xy.every(([x]) => x > maxX) ||
      xy.every(([, y]) => y < minY) ||
      xy.every(([, y]) => y > maxY)
    ) {
      continue;
    }

    const crossesRing = xy.some((a, e) =>
      ringM.some((c, r) => segmentsTouch(a, xy[(e + 1) % 3]!, c, ringM[(r + 1) % ringM.length]!)),
    );
    if (!crossesRing && xy.every((p) => insideRing(p, ringM))) {
      for (const corner of corners) outIndices.push(emit(corner));
      continue;
    }

    pieces.forEach((planes, k) => {
      let polygon: ClipVertex[] = corners;
      for (let j = 0; j < planes.length && polygon.length >= 3; j++) {
        polygon = clipPolygonByHalfPlane(polygon, planes[j]!, `${k}:${j}`);
      }
      for (let m = 1; m + 1 < polygon.length; m++) {
        outIndices.push(emit(polygon[0]!), emit(polygon[m]!), emit(polygon[m + 1]!));
      }
    });
  }

  return {
    positions: new Float32Array(outPositions),
    uvs: new Float32Array(outUvs),
    indices: new Uint32Array(outIndices),
    image: geometry.image,
  };
}
