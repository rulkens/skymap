/**
 * meshFetcher — `Fetcher<MeshAsset, MeshReq>`: one `.mesh` geometry binary plus
 * the `MESH_TEXTURE_SLOTS` maps, all under `public/data/meshes/<key>-<px>.*`
 * (`req.tier` already clamped to the body's ceiling by `meshBodyRow.req`); the
 * contact mask stays untiered at `<key>_contact.webp`.
 *
 * A slot whose format is not sRGB carries numeric channels rather than a
 * picture, so it decodes with `colorSpaceConversion: 'none'` — the full writeup
 * is in `bodyTextureFetcher.ts`.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { MeshReq } from '../../../@types/loading/MeshReq';
import type { MeshAsset } from '../../../@types/data/mesh/MeshAsset';
import type { MeshTextureField } from '../../../@types/data/mesh/MeshTextureField';
import { MESH_ASSETS } from '../../../data/bodies/meshAssets.generated';
import { decodeMesh } from '../../../data/mesh/meshBinaryFormat';
import { MESH_TEXTURE_SLOTS } from '../../../data/mesh/meshTextureSlots';
import { meshTierPrefix } from '../../../utils/meshBodies/meshTierPrefix';
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
  const prefix = meshTierPrefix(req.meshKey, req.tier);
  const contactUrl = dataUrl(`meshes/${req.meshKey}_contact.webp`);
  const hasContactDecal = MESH_ASSETS[req.meshKey]?.contactDecal !== undefined;

  const [buf, textures, contactShadow] = await Promise.all([
    fetchWithProgress(dataUrl(`${prefix}.mesh`), signal, onProgress),
    // `fromEntries` widens the key back to `string`; the slot table is what
    // makes the record exhaustive, so the assertion is restating it, not
    // hiding a gap.
    Promise.all(
      MESH_TEXTURE_SLOTS.map(
        async (slot) =>
          [
            slot.field,
            await fetchTexture(
              dataUrl(`${prefix}${slot.suffix}.webp`),
              signal,
              !slot.format.endsWith('-srgb'),
            ),
          ] as const,
      ),
    ).then((entries) => Object.fromEntries(entries) as Record<MeshTextureField, ImageBitmap>),
    // The shadow is garnish: a missing mask drops it, never the rover.
    hasContactDecal
      ? fetchTexture(contactUrl, signal, true).catch((err: Error) => {
          if (err.name === 'AbortError') throw err;
          return undefined;
        })
      : undefined,
  ]);
  const geometry = await decodeMesh(buf);

  return { ...geometry, ...textures, ...(contactShadow ? { contactShadow } : {}) };
};
