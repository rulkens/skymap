/**
 * meanAlbedo — average LINEAR-RGB colour of a mesh's surface, baked into its
 * generated row so the distant glint (which never binds the texture) shows the
 * body's real colour. The pixels arrive sRGB-ENCODED, as every PNG albedo map
 * is: averaging the bytes straight would report mid-grey as 0.50 instead of
 * 0.22. It samples each triangle's UV centroid weighted by its 3D area, not
 * every texel: a baked atlas leaves the space between UV islands black, and
 * that once darkened Bennu's glint by a quarter.
 */

import type { Vec3 } from '../../src/@types/math/Vec3';
import type { Geometry } from './@types/Geometry';
import { triangleArea } from '../utils/meshes/triangleArea';
import { srgbToLinear } from '../../src/utils/color/srgbToLinear';

export function meanAlbedo(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  geometry: Pick<Geometry, 'positions' | 'uvs' | 'indices'>,
): Vec3 {
  const { positions, uvs, indices } = geometry;
  const channels = pixels.length / (width * height);
  const sum: Vec3 = [0, 0, 0];
  let totalArea = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const area = triangleArea(positions, a, b, c);
    // glTF UVs put (0, 0) at the image's top-left, as the decoded rows run; they
    // stay in [0, 1] (`writeMeshBinary` refuses others), so 1.0 is the only clamp.
    const u = (uvs[2 * a]! + uvs[2 * b]! + uvs[2 * c]!) / 3;
    const v = (uvs[2 * a + 1]! + uvs[2 * b + 1]! + uvs[2 * c + 1]!) / 3;
    const x = Math.min(width - 1, Math.floor(u * width));
    const y = Math.min(height - 1, Math.floor(v * height));
    const o = (y * width + x) * channels;
    for (let i = 0; i < 3; i++) sum[i]! += area * srgbToLinear(pixels[o + i]! / 255);
    totalArea += area;
  }
  return sum.map((s) => s / totalArea) as Vec3;
}
