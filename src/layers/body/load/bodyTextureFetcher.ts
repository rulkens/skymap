/**
 * bodyTextureFetcher: `Fetcher<ImageBitmap, BodyTextureReq>` for the keyed
 * `bodyTextures` slot family (every textured body and the Saturn ring strip).
 * The on-disk name comes from `bodyTextureFilename`, shared with the build tool
 * (`buildTextures`), so URL and emitted file cannot drift. The slot's
 * `AbortSignal` aborts the download and, chained off `res.blob()`, the decode.
 * A 404 or decode failure throws into the slot's `error` state and the renderer
 * keeps its placeholder.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import { bodyTextureFilename } from '../../../utils/bodyTextures/bodyTextureFilename';
import { isLinearTextureKind } from '../../../utils/bodyTextures/isLinearTextureKind';
import { dataUrl } from '../../../services/loading/fetchWithProgress';

export const bodyTextureFetcher: Fetcher<ImageBitmap, BodyTextureReq> = async (req, signal) => {
  const url = dataUrl(`images/textures/${bodyTextureFilename(req.bodyId, req.kind, req.tier)}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`bodyTexture: HTTP ${res.status} for ${url}`);
  // Vite's SPA fallback answers a missing `public/` file with index.html and a 200;
  // unchecked, it fails in createImageBitmap as an opaque decode error.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(
      `bodyTexture: non-image response (${contentType || 'no content-type'}) for ${url}`,
    );
  }
  const blob = await res.blob();
  // Linear maps (material, normal) carry NUMERIC channels; default colour
  // management would gamma-shift them, so decode raw.
  if (isLinearTextureKind(req.kind)) {
    return createImageBitmap(blob, { colorSpaceConversion: 'none' });
  }
  return createImageBitmap(blob);
};
