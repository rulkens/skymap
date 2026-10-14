/**
 * galaxyCatalogFetcher — `Fetcher<GalaxyCatalog, GalaxyCatalogReq>`: download
 * the tier's `.bin` and decode it. Never called for an excluded tier (target 0,
 * no file): the asset row does not demand it there.
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
import { decodeGalaxyCatalog } from '../../../data/galaxyCatalog/galaxyCatalogFormat';
import { tierFilenameForSource } from '../../../data/tierTargets';
import { dataUrl, fetchWithProgress } from '../../../services/loading/fetchWithProgress';

export const galaxyCatalogFetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq> = async (
  req,
  signal,
  onProgress,
) => {
  const url = dataUrl(tierFilenameForSource(req.source, req.tier));
  const buf = await fetchWithProgress(url, signal, onProgress);
  return decodeGalaxyCatalog(buf);
};
