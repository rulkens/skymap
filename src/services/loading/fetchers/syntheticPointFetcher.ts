/**
 * syntheticPointFetcher — `Fetcher<PointCloud, PointCloudReq>` that
 * resolves synchronously to a deterministic procedural cloud.
 *
 * ### Why this exists
 *
 * The boot path needs a fallback when every real survey is empty/errored
 * (no network, missing .bin files, dev launch with no data).  Pre-spec-A
 * the engine called `renderer.upload(Source.Synthetic, generateSyntheticCloud(...))`
 * directly, bypassing the slot machinery — two code paths for the same
 * conceptual "this source is now on the GPU" event.
 *
 * Routing the synthetic through a slot collapses both paths into one.
 * Synthetic gets the same fade-in, the same `LoadingDevPanel` row, the
 * same retry semantics, and the same race-checked commit ordering as
 * every real survey for free.
 *
 * ### Why a fixed count
 *
 * 100k matches the hard-coded value the legacy direct-upload path used.
 * The synthetic generator's reason-for-existing is "give the user
 * something to look at when no real data is available"; making the
 * count user-tunable would expand surface area for no real-world need.
 *
 * ### Why this fetcher ignores `req.source` and `req.tier`
 *
 * The slot's typed `Req = PointCloudReq = { source, tier }` because the
 * `state.assetSlots.points` Map is uniformly typed across every entry.
 * For the synthetic slot specifically, the request fields carry no
 * information — the cloud is pure procedural.  We accept the standard
 * shape so the slot wiring at the engine boot site is uniform with
 * every other source's `slot.load({ source, tier })` call.
 */

import type { Fetcher } from '../types';
import type { PointCloud } from '../../../@types/data/PointCloud';
import type { PointCloudReq } from './pointCloudFetcher';
import { generateSyntheticCloud } from '../../../data/synthetic';

/** Hard-coded synthetic cloud size — matches the legacy fallback. */
export const SYNTHETIC_POINT_COUNT = 100_000;

export const syntheticPointFetcher: Fetcher<PointCloud, PointCloudReq> = async () => {
  return generateSyntheticCloud(SYNTHETIC_POINT_COUNT);
};
