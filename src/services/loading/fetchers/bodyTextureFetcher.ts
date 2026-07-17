/**
 * bodyTextureFetcher — `Fetcher<ImageBitmap, BodyTextureReq>` for the keyed
 * `bodyTextures` slot family: one shared fetcher across every textured body and
 * the Saturn ring strip.
 *
 * The filename encodes the tier: `tierToTexturePx` turns the request tier into
 * the pixel edge (2k / 4k / 8k) the build pipeline emitted, so the runtime
 * reconstructs the exact on-disk name — `<bodyId>-<px>.jpg`. A mismatch between
 * the build's size ladder and this one would surface as a silent 404, which is
 * why the tier→px mapping lives in one small shared function both sides call.
 *
 * The ring strip is the one PNG: `saturn-ring-<px>.png`. It needs a real alpha
 * channel (the annulus has a transparent centre and soft radial gaps), which a
 * JPG cannot carry — every spherical body is opaque and ships as the smaller
 * JPG. `bodyId === 'saturn-ring'` is the whole branch; there is no per-body
 * extension table because only the ring is non-opaque.
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
import { tierToTexturePx } from '../../../utils/math/tierToTexturePx';
import { dataUrl } from '../fetchWithProgress';

export const bodyTextureFetcher: Fetcher<ImageBitmap, BodyTextureReq> = async (req, signal) => {
  const px = tierToTexturePx(req.tier);
  // The ring strip is a PNG for its alpha channel; every spherical body is an
  // opaque JPG. A single-id branch is honest because only the ring is non-opaque.
  const filename =
    req.bodyId === 'saturn-ring' ? `saturn-ring-${px}.png` : `${req.bodyId}-${px}.jpg`;
  const url = dataUrl(`images/textures/${filename}`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`bodyTexture: HTTP ${res.status} for ${url}`);
  return createImageBitmap(await res.blob());
};
