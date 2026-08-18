/**
 * loadCatalogPoints — fetch skymap's v9 galaxy catalogs over the runtime
 * boot seams and merge into flat position/mass arrays for the sim.
 *
 * Mirrors `galaxyCatalogFetcher`'s manifest → tier-filename → dataUrl →
 * fetchWithProgress → decode chain (the excluded-tier short-circuit
 * included), fanned out over `sources` and concatenated. Pure and
 * store-free: no redux, no engine state, no AssetSlot lifecycle — this
 * tool owns its own abort-less fetches.
 */
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { Tier } from '../../../../src/@types/data/Tier';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { CatalogPoints } from '../../@types/CatalogPoints';
import { loadDataManifest } from '../../../../src/services/loading/dataManifest';
import { dataUrl, fetchWithProgress } from '../../../../src/services/loading/fetchWithProgress';
import { tierTarget, tierFilenameForSource } from '../../../../src/data/tierTargets';
import {
  decodeGalaxyCatalog,
  emptyGalaxyCatalog,
} from '../../../../src/data/galaxyCatalog/galaxyCatalogFormat';

async function fetchSourceCatalog(source: SourceType, tier: Tier): Promise<GalaxyCatalog> {
  if (tierTarget(source, tier) === 0) return emptyGalaxyCatalog();
  const url = dataUrl(tierFilenameForSource(source, tier));
  const buf = await fetchWithProgress(url, new AbortController().signal, () => {});
  return decodeGalaxyCatalog(buf);
}

export async function loadCatalogPoints(
  sources: readonly SourceType[],
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
    log10StellarMass.set(catalog.log10StellarMass, offset);
    offset += catalog.count;
  }

  return { positions, log10StellarMass, count, sources };
}
