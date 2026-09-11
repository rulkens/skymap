/**
 * meshFetcher — `Fetcher<MeshAsset, MeshReq>`: one `.mesh` geometry binary plus
 * its three baked PBR textures, all under `public/data/meshes/<key>.*`. Three
 * fixed roles, so no `TextureKind` dispatch the way `bodyTextureFetcher` needs.
 *
 * `_mr` and `_normal` carry numeric channels, not a picture, so both decode
 * with `colorSpaceConversion: 'none'`; `_albedo` is a colour map and takes the
 * default managed (sRGB) decode — `bodyTextureFetcher.ts` has the full writeup.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';
import { decodeMesh } from '../../../data/mesh/meshBinaryFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

async function fetchTexture(
  url: string,
  signal: AbortSignal,
  linear: boolean,
): Promise<ImageBitmap> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`meshFetcher: HTTP ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(
      `meshFetcher: non-image response (${contentType || 'no content-type'}) for ${url}`,
    );
  }
  const blob = await res.blob();
  return linear
    ? createImageBitmap(blob, { colorSpaceConversion: 'none' })
    : createImageBitmap(blob);
}

export const meshFetcher: Fetcher<MeshAsset, MeshReq> = async (req, signal, onProgress) => {
  const prefix = `meshes/${req.meshKey}`;
  const buf = await fetchWithProgress(dataUrl(`${prefix}.mesh`), signal, onProgress);
  const geometry = decodeMesh(buf);

  const [albedo, metalRough, normalMap] = await Promise.all([
    fetchTexture(dataUrl(`${prefix}_albedo.png`), signal, false),
    fetchTexture(dataUrl(`${prefix}_mr.png`), signal, true),
    fetchTexture(dataUrl(`${prefix}_normal.png`), signal, true),
  ]);

  return { ...geometry, albedo, metalRough, normalMap };
};
