/**
 * pointCloudFetcher — `Fetcher<PointCloud, PointCloudReq>`.
 *
 * The first concrete fetcher for the asset-loading subsystem.  Encodes
 * one piece of policy that previously lived in `cloudLoader.ts`:
 *
 *   "If the configured target for (source, tier) is 0, do not fetch
 *    anything — return a count=0 PointCloud."
 *
 * ### Why short-circuit here rather than in the AssetSlot
 *
 * The slot is intentionally generic over `<T, Req>` and knows nothing about
 * tiers, sources, or surveys.  Encoding the excluded-tier rule inside the
 * fetcher keeps the slot's type signature pristine — the fetcher decides
 * what "successful fetch" means for its own asset.  A different fetcher
 * (filaments, sidecar JSON) might have a totally different short-circuit
 * rule, or none at all; the slot doesn't care.
 *
 * ### Why `emptyPointCloud()` rather than `null`
 *
 * Returning a count=0 PointCloud composes cleanly with
 * `pointRenderer.upload`, which already treats count=0 as "free this
 * source's VRAM".  The slot's commit step still runs and frees the buffer.
 * If we returned `null`, every consumer would need a null-check before
 * touching the cloud — a lot of branching to dodge a value that the
 * downstream code already handles.  One path through the type system.
 *
 * ### Why fetch + decode in one fetcher
 *
 * Splitting fetch and decode into two slots would complicate the lifecycle:
 * the decode needs the raw `ArrayBuffer`, which only exists transiently.
 * Pairing them keeps the slot's `T` aligned with what consumers actually
 * want (a renderer-ready PointCloud) and lets the buffer be GC'd after
 * decode without any explicit handoff.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { PointCloudReq } from '../../../@types/loading/PointCloudReq';
import type { PointCloud } from '../../../@types/data/PointCloud';
import { decodePointCloud, emptyPointCloud } from '../../../data/pointCloudFormat';
import { TIER_TARGETS, tierFilenameForSource } from '../../../data/tierTargets';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const pointCloudFetcher: Fetcher<PointCloud, PointCloudReq> = async (
  req,
  signal,
  onProgress,
) => {
  // Excluded-tier short-circuit: target=0 means "this source is
  // intentionally absent at this tier" (e.g. SDSS at `small`).  No URL
  // exists for the missing file, so we MUST not call fetchWithProgress.
  if (TIER_TARGETS[req.tier][req.source] === 0) {
    return emptyPointCloud();
  }
  const url = dataUrl(tierFilenameForSource(req.source, req.tier));
  const buf = await fetchWithProgress(url, signal, onProgress);
  return decodePointCloud(buf);
};
