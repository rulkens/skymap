/**
 * bodyTextureFetcher — `Fetcher<ImageBitmap, BodyTextureReq>` for the keyed
 * `bodyTextures` slot family: one shared fetcher across every textured body and
 * the Saturn ring strip.
 *
 * The on-disk name comes from the shared `bodyTextureFilename` helper, which the
 * build tool (`buildTextures`) also calls — so the runtime URL and the emitted
 * file can never drift onto different names (a mismatch would 404 and render the
 * blue placeholder). The helper folds in the tier→px mapping, the
 * surface-is-unsegmented convention, and the ring's WebP-for-alpha extension, so
 * this fetcher no longer special-cases the ring id or constructs the name inline.
 *
 * The `AssetSlot` threads its own `AbortSignal` into `fetch`, so a slot
 * cancel/reload (teardown, a re-demand at a new tier, or an eviction while a
 * prior fetch is still in flight) aborts the multi-MB download AND — because the
 * decode is chained off `res.blob()` — skips the `createImageBitmap` decode too.
 *
 * Posture on failure is silent-optional-asset (the same posture the former
 * bespoke Earth-texture fetcher carried): a 404 / decode failure throws, the
 * error flows to the
 * slot's `error` state, and the renderer keeps drawing its flat-albedo
 * placeholder sphere rather than crashing the descent. Non-Earth textures
 * demanded before Plan 03 ships their assets take exactly this harmless path.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import { bodyTextureFilename } from '../../../utils/scene/bodyTextureFilename';
import { isLinearTextureKind } from '../../../utils/scene/isLinearTextureKind';
import { dataUrl } from '../fetchWithProgress';

export const bodyTextureFetcher: Fetcher<ImageBitmap, BodyTextureReq> = async (req, signal) => {
  const url = dataUrl(`images/textures/${bodyTextureFilename(req.bodyId, req.kind, req.tier)}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`bodyTexture: HTTP ${res.status} for ${url}`);
  // A missing file under `public/` still comes back 200 in dev — Vite's SPA
  // fallback serves index.html for any GET whose Accept header allows `*/*`
  // (the fetch() default). Left unchecked, that HTML reaches
  // createImageBitmap and fails as an opaque "source image could not be
  // decoded", hiding the real 404 path.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error(
      `bodyTexture: non-image response (${contentType || 'no content-type'}) for ${url}`,
    );
  }
  const blob = await res.blob();
  // Linear-packed maps (material today, normal with plan C) carry NUMERIC channels
  // — roughness, an ocean mask, a normal vector — not a picture. Decoding them with
  // the default colour management would gamma-shift those numbers; `colorSpaceConversion:
  // 'none'` hands back the raw bytes. sRGB colour maps (surface/night/clouds) take
  // the default managed decode. `isLinearTextureKind` is the single home for that
  // axis — the same predicate that picks the WebP extension and the GPU format.
  if (isLinearTextureKind(req.kind)) {
    return createImageBitmap(blob, { colorSpaceConversion: 'none' });
  }
  return createImageBitmap(blob);
};
