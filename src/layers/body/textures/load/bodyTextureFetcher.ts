/**
 * bodyTextureFetcher: `Fetcher<ImageBitmap, BodyTextureReq>` for the keyed
 * `bodyTextures` slot family (every textured body and the Saturn ring strip).
 * It tries `bodyTextureUrls` in order (a live daily map, then the built-in
 * tier); any failure moves on, and only the last one throws into the slot's
 * `error` state, where the renderer keeps its placeholder. The slot's
 * `AbortSignal` aborts the download and, chained off `res.blob()`, the decode;
 * an abort never falls through to the next URL.
 */

import type { Fetcher } from '../../../../@types/loading/Fetcher';
import type { BodyTextureReq } from '../@types/BodyTextureReq';
import { isGreyTextureKind } from '../../../../utils/bodyTextures/isGreyTextureKind';
import { isLinearTextureKind } from '../../../../utils/bodyTextures/isLinearTextureKind';
import { bodyTextureUrls } from './bodyTextureUrls';

export const bodyTextureFetcher: Fetcher<ImageBitmap, BodyTextureReq> = async (req, signal) => {
  let lastError: unknown;
  for (const resolveUrl of bodyTextureUrls(req, signal)) {
    try {
      const url = await resolveUrl();
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
      // Linear maps carry NUMERIC channels and a grey map's byte is its coverage;
      // default colour management would shift either, so decode raw.
      if (isLinearTextureKind(req.kind) || isGreyTextureKind(req.kind)) {
        return await createImageBitmap(blob, { colorSpaceConversion: 'none' });
      }
      return await createImageBitmap(blob);
    } catch (err) {
      if (signal.aborted) throw err;
      lastError = err;
    }
  }
  throw lastError;
};
