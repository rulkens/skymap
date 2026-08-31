/**
 * galaxyCatalogFetcher — `Fetcher<GalaxyCatalog, GalaxyCatalogReq>`.
 *
 * Encodes one piece of fetch policy:
 *
 *   "If the configured target for (source, tier) is 0, do not fetch
 *    anything — return a count=0 GalaxyCatalog."
 *
 * ### Why short-circuit here rather than in the AssetSlot
 *
 * The slot is intentionally generic over `<T, Req>` and knows nothing about
 * tiers, sources, or galaxy catalogs.  Encoding the excluded-tier rule inside the
 * fetcher keeps the slot's type signature pristine — the fetcher decides
 * what "successful fetch" means for its own asset.  A different fetcher
 * (filaments, sidecar JSON) might have a totally different short-circuit
 * rule, or none at all; the slot doesn't care.
 *
 * ### Why `emptyGalaxyCatalog()` rather than `null`
 *
 * Returning a count=0 GalaxyCatalog composes cleanly with
 * `galaxyPointRenderer.upload`, which already treats count=0 as "free this
 * source's VRAM".  The slot's commit step still runs and frees the buffer.
 * If we returned `null`, every consumer would need a null-check before
 * touching the catalog — a lot of branching to dodge a value that the
 * downstream code already handles.  One path through the type system.
 *
 * ### Why fetch + decode in one fetcher
 *
 * Splitting fetch and decode into two slots would complicate the lifecycle:
 * the decode needs the raw `ArrayBuffer`, which only exists transiently.
 * Pairing them keeps the slot's `T` aligned with what consumers actually
 * want (a renderer-ready GalaxyCatalog) and lets the buffer be GC'd after
 * decode without any explicit handoff.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import {
  decodeGalaxyCatalog,
  emptyGalaxyCatalog,
} from '../../../data/galaxyCatalog/galaxyCatalogFormat';
import { tierTarget, tierFilenameForSource } from '../../../data/tierTargets';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export const galaxyCatalogFetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq> = async (
  req,
  signal,
  onProgress,
) => {
  // Excluded-tier short-circuit: target=0 means "this source is
  // intentionally absent at this tier" (e.g. SDSS at `small`).  No URL
  // exists for the missing file, so we MUST not call fetchWithProgress.
  if (tierTarget(req.source, req.tier) === 0) {
    return emptyGalaxyCatalog();
  }
  const url = dataUrl(tierFilenameForSource(req.source, req.tier));
  const buf = await fetchWithProgress(url, signal, onProgress);
  return decodeGalaxyCatalog(buf);
};
