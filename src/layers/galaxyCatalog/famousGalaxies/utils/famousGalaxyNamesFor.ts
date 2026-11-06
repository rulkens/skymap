/**
 * famousGalaxyNamesFor — the compiled-in names table, if it belongs to a famous catalog of
 * `recordCount` rows. The table names galaxies by record index, so a bundle and a `famous.bin`
 * from different generations would put each galaxy after the change under its neighbour's name
 * and `#focus=` link; a count mismatch answers null and every reader names nothing instead.
 */
import { FAMOUS_GALAXY_NAMES } from '../data/famousGalaxyNames.generated';
import type { FamousGalaxyName } from '../@types/FamousGalaxyName';

export function famousGalaxyNamesFor(recordCount: number): readonly FamousGalaxyName[] | null {
  return recordCount === FAMOUS_GALAXY_NAMES.length ? FAMOUS_GALAXY_NAMES : null;
}
