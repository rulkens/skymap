/**
 * syntheticPointFetcher — `Fetcher<GalaxyCatalog, GalaxyCatalogReq>` that
 * resolves synchronously to a deterministic procedural catalog.
 *
 * ### Why this exists
 *
 * The boot path needs a fallback when every real galaxy catalog is empty/errored
 * (no network, missing .bin files, dev launch with no data).  Pre-spec-A
 * the engine called `renderer.upload(Source.Synthetic, generateSyntheticCloud(...))`
 * directly, bypassing the slot machinery — two code paths for the same
 * conceptual "this source is now on the GPU" event.
 *
 * Routing the synthetic through a slot collapses both paths into one.
 * Synthetic gets the same fade-in, the same `LoadingDevPanel` row, the
 * same retry semantics, and the same race-checked commit ordering as
 * every real galaxy catalog for free.
 *
 * ### Why a fixed count
 *
 * 100k matches the hard-coded value the legacy direct-upload path used.
 * The synthetic generator's reason-for-existing is "give the user
 * something to look at when no real data is available"; making the
 * count user-tunable would expand surface area for no real-world need.
 *
 * ### Why this fetcher ignores its request
 *
 * It takes `GalaxyCatalogReq` because the `state.assetSlots.points` Map is
 * uniformly typed across every entry; for the synthetic slot the request
 * carries no information, since the catalog is pure procedural.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import { generateSyntheticCloud } from '../../../data/galaxyCatalog/synthetic';

/** Hard-coded synthetic catalog size — matches the legacy fallback. */
export const SYNTHETIC_POINT_COUNT = 100_000;

export const syntheticPointFetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq> = async () => {
  return generateSyntheticCloud(SYNTHETIC_POINT_COUNT);
};
