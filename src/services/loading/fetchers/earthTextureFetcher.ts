/**
 * earthTextureFetcher — `Fetcher<ImageBitmap, void>` for the Blue Marble
 * equirectangular texture that skins the true-scale Earth on deep descent.
 *
 * Mirrors the other single-URL sidecar fetchers (`flowFieldFetcher`,
 * `cf4DensityFetcher`): one URL, no per-request branching. The request payload
 * is `void` — there is one and only one Earth texture, and it is neither
 * tier-gated nor per-source.
 *
 * The `AssetSlot` threads its own `AbortSignal` into `fetch`, so a slot
 * cancel/reload (teardown, or a re-demand while a prior fetch is in flight)
 * aborts the ~MB JPG download AND, because the decode is chained off `res.blob`,
 * skips the multi-megabyte `createImageBitmap` decode too. That threading is the
 * abort-on-release mechanism the migration buys over the old fire-and-forget
 * IIFE, which nothing could cancel.
 *
 * On a 404 / decode failure the thrown error flows to the slot's `error` state
 * and the renderer simply keeps drawing its mid-blue placeholder sphere — the
 * same silent-optional-asset posture as `flowFieldFetcher` (a missing optional
 * asset disables its skin rather than crashing the descent).
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';

// Blue Marble placeholder URL, inlined here as a temporary bridge: Earth's
// per-body `textureUrl` field is gone (Earth now rides the keyed `bodyTextures`
// slot family). This whole bespoke fetcher is deleted when Earth joins that
// family, so the literal need not find a permanent home.
const BLUE_MARBLE_URL = '/images/earth/blue-marble-4k.jpg';

export const earthTextureFetcher: Fetcher<ImageBitmap, void> = async (_req, signal) => {
  const res = await fetch(BLUE_MARBLE_URL, { signal });
  if (!res.ok) throw new Error(`earthTexture: HTTP ${res.status} for ${BLUE_MARBLE_URL}`);
  return createImageBitmap(await res.blob());
};
