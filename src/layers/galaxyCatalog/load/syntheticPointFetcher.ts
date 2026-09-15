/**
 * syntheticPointFetcher — a deterministic procedural catalog, resolved
 * synchronously, for the boot path where every real catalog is empty or errored
 * (no network, missing .bin, dev launch with no data). It goes through a slot
 * like any catalog so it shares one fade-in, retry and commit-ordering path.
 * The request argument carries nothing: the cloud is pure procedural.
 */

import type { Fetcher } from '../../../@types/loading/Fetcher';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import { generateSyntheticCloud } from '../../../data/galaxyCatalog/synthetic';

export const SYNTHETIC_POINT_COUNT = 100_000;

export const syntheticPointFetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq> = async () => {
  return generateSyntheticCloud(SYNTHETIC_POINT_COUNT);
};
