/**
 * /api/galaxies — list endpoint.
 *
 * Returns the seed catalogue as an array, each entry augmented with
 * `curated: boolean` flag derived from the override index.  The UI
 * uses this to populate the left panel + render done-state checkmarks.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFamousSeed } from '../../../parsers/famousSeed.js';
import { RAW_DATA } from '../../../utils/io/rawDataRegistry.js';
import { loadOverrideIndex } from '../overrideIndex.js';
import { overrideIndexPath } from '../paths.js';

export type GalaxyListEntry = {
  id: string;
  names: string[];
  ra: number;
  dec: number;
  distanceMpc: number;
  diameterKpc: number;
  type: string;
  description: string;
  curated: boolean;
  /** Disk axis ratio b/a from the seed (HyperLEDA logr25).  Absent when the
   *  seed has no photometric measurement for this galaxy. */
  axisRatio?: number;
};

export type GalaxiesResult = {
  galaxies: GalaxyListEntry[];
};

export async function handleGalaxies(opts: { repoRoot: string }): Promise<GalaxiesResult> {
  const seedPath = resolve(opts.repoRoot, RAW_DATA['famous.seed'].path);
  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  const idx = loadOverrideIndex(overrideIndexPath(opts.repoRoot));
  const galaxies: GalaxyListEntry[] = entries.map((e) => ({
    id: e.id,
    names: e.names,
    ra: e.ra,
    dec: e.dec,
    distanceMpc: e.distanceMpc,
    diameterKpc: e.diameterKpc,
    type: e.type,
    description: e.description,
    curated: idx.entries[e.id] !== undefined,
    // Spread-in only when defined so the wire JSON omits the key entirely
    // for galaxies without a measured b/a — consistent with optional-field
    // conventions used elsewhere in the API.
    ...(e.axisRatio !== undefined ? { axisRatio: e.axisRatio } : {}),
  }));
  return { galaxies };
}
