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
};

export type GalaxiesResult = {
  galaxies: GalaxyListEntry[];
};

export async function handleGalaxies(opts: {
  repoRoot: string;
}): Promise<GalaxiesResult> {
  const seedPath = resolve(opts.repoRoot, 'data/famous_galaxies.seed.json');
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
  }));
  return { galaxies };
}
