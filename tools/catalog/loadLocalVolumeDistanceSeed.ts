/**
 * Load the curated local-volume distance seed into the lookup map the
 * distance override consumes.
 *
 * The seed exists to rescue a specific, tiny population: the ~10 blueshifted
 * 2MRS galaxies (negative cz) that both CF4 and the partial HyperLEDA cache
 * miss. Without a redshift-independent distance those rows fall to the cz
 * path, whose negative Hubble distance mirrors them through the origin to a
 * nonsense antipodal position (and, as a knock-on, sizes them from the flat
 * 30 kpc fallback because their cz-baked diameter is null). A hand-verified
 * distance keyed by 2MASS designation puts them back on the sky at the right
 * distance, and the pipeline re-derives their physical size from the 2MRS
 * Riso angular measurement against that distance.
 *
 * Keyed by 2MASS XSC designation (`massId`), not PGC, because most of these
 * rows never acquired a PGC cross-walk — the very reason the PGC-keyed CF4 /
 * HyperLEDA lookups skip them.
 *
 * Missing-file tolerant: a checkout without the seed (or a malformed seed)
 * yields an empty map, so the build still succeeds — those galaxies just stay
 * on the cz path, exactly as before the seed existed.
 */
import { readFileSync } from 'node:fs';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import type { LocalVolumeDistanceSeed } from './catalogDistanceFor';

/** One curated seed row as stored on disk. */
type SeedRow = {
  /** 2MASS XSC designation, no `2MASX J` prefix, e.g. `01092707+3543047`. */
  massId: string;
  /** Redshift-independent distance in megaparsecs. */
  distMpc: number;
  /** Common name — documentation only, not consumed by the build. */
  name?: string;
  /** Distance method/source — documentation only. */
  method?: string;
};

export function loadLocalVolumeDistanceSeed(): LocalVolumeDistanceSeed {
  const out: LocalVolumeDistanceSeed = new Map();
  let rows: SeedRow[];
  try {
    rows = JSON.parse(readFileSync(rawDataPath('localvolume.distances'), 'utf8')) as SeedRow[];
  } catch {
    return out;
  }
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (typeof row.massId !== 'string') continue;
    if (typeof row.distMpc !== 'number' || !Number.isFinite(row.distMpc) || row.distMpc <= 0) {
      continue;
    }
    out.set(row.massId, { distMpc: row.distMpc });
  }
  return out;
}
