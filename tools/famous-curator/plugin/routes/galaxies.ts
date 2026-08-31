/**
 * /api/galaxies — list endpoint.
 *
 * Returns the seed catalogue as an array, each entry augmented with a
 * `curated` flag (from the override index) and a `hasDisk` flag (whether
 * the committed recipe carries a calibrated disk).  The UI uses these to
 * populate the left panel + render done-state and disk indicators.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFamousSeed } from '../../../parsers/famousSeed.ts';
import { RAW_DATA } from '../../../utils/io/rawDataRegistry.ts';
import { loadOverrideIndex } from '../overrideIndex.ts';
import { overrideIndexPath, recipePath } from '../paths.ts';
import { parseRecipe } from '../recipe.ts';

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
  /** True when the galaxy's committed recipe carries a calibrated disk block.
   *  Lets the list flag which galaxies have had their disk geometry set. */
  hasDisk: boolean;
  /** Deproject flag of the committed disk; undefined when the galaxy has no
   *  disk.  Lets the list distinguish deprojected (face-on corrected) disks
   *  from flat ones.  Kept separate from hasDisk so recipes without a disk
   *  omit the field entirely rather than carrying a meaningless false. */
  diskDeproject?: boolean;
};

export type GalaxiesResult = {
  galaxies: GalaxyListEntry[];
};

/**
 * The committed disk of a galaxy, or undefined when it has none.  Only
 * curated galaxies have a recipe.json on disk, so we read at most once per
 * curated entry.  A missing or malformed recipe is treated as "no disk"
 * rather than propagating an error — the list should still render.
 */
function committedDisk(repoRoot: string, id: string): { deproject: boolean } | undefined {
  const path = recipePath(repoRoot, id);
  if (!existsSync(path)) return undefined;
  try {
    return parseRecipe(readFileSync(path, 'utf8')).disk;
  } catch {
    return undefined;
  }
}

export async function handleGalaxies(opts: { repoRoot: string }): Promise<GalaxiesResult> {
  const seedPath = resolve(opts.repoRoot, RAW_DATA['famous.seed'].path);
  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  const idx = loadOverrideIndex(overrideIndexPath(opts.repoRoot));
  const galaxies: GalaxyListEntry[] = entries.map((e) => {
    // Only curated galaxies can have a disk; committedDisk short-circuits on
    // the missing recipe.json for the rest, so this stays cheap.
    const disk = idx.entries[e.id] !== undefined ? committedDisk(opts.repoRoot, e.id) : undefined;
    return {
      id: e.id,
      names: e.names,
      ra: e.ra,
      dec: e.dec,
      distanceMpc: e.distanceMpc,
      diameterKpc: e.diameterKpc,
      type: e.type,
      description: e.description,
      curated: idx.entries[e.id] !== undefined,
      hasDisk: disk !== undefined,
      // Spread-in only when defined so the wire JSON omits the key entirely
      // for galaxies without a disk (and without a measured b/a) — consistent
      // with optional-field conventions used elsewhere in the API.
      ...(disk !== undefined ? { diskDeproject: disk.deproject } : {}),
      ...(e.axisRatio !== undefined ? { axisRatio: e.axisRatio } : {}),
    };
  });
  return { galaxies };
}
