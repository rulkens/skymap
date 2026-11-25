/**
 * loadCatalogPoints — fetch skymap's v9 galaxy catalogs over the runtime
 * boot seams and merge into flat position/weight arrays for the sim (log-mass
 * converted to the port's linear weight on the way in).
 *
 * Mirrors `galaxyCatalogFetcher`'s manifest → tier-filename → dataUrl →
 * fetchWithProgress → decode chain (the excluded-tier short-circuit
 * included), fanned out over `sources` and concatenated. Pure and
 * store-free: no redux, no engine state, no AssetSlot lifecycle — this
 * tool owns its own abort-less fetches.
 */
import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../src/@types/data/Tier';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import { loadDataManifest } from '../../../../src/services/loading/dataManifest';
import { dataUrl, fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import {
  tierTarget,
  tierFilenameForSource,
} from '../../../../src/layers/galaxyCatalog/records/data/tierTargets';
import {
  decodeGalaxyCatalog,
  emptyGalaxyCatalog,
} from '../../../../src/layers/galaxyCatalog/records/data/galaxyCatalogFormat';
import { massWeightFromLog10 } from './massWeightFromLog10';

async function fetchSourceCatalog(source: GalaxyCatalogId, tier: Tier): Promise<GalaxyCatalog> {
  if (tierTarget(source, tier) === 0) return emptyGalaxyCatalog();
  const url = dataUrl(tierFilenameForSource(source, tier));
  const buf = await fetchWithProgress(url, new AbortController().signal, () => {});
  return decodeGalaxyCatalog(buf);
}

export async function loadCatalogPoints(
  sources: readonly GalaxyCatalogId[],
  tier: Tier,
): Promise<CatalogPoints> {
  await loadDataManifest();
  const catalogs = await Promise.all(sources.map((source) => fetchSourceCatalog(source, tier)));

  let count = 0;
  for (const catalog of catalogs) count += catalog.count;

  const positions = new Float32Array(count * 3);
  const log10StellarMass = new Float32Array(count);
  let offset = 0;
  for (const catalog of catalogs) {
    positions.set(catalog.positions, offset * 3);
    for (let i = 0; i < catalog.count; i++) {
      log10StellarMass[offset + i] = massWeightFromLog10(catalog.log10StellarMass[i]!);
    }
    offset += catalog.count;
  }

  return { positions, log10StellarMass, count, sources };
}
