/**
 * Path of the quick-look sentinel: one shared home for the `.quicklook`
 * suffix + epoch prefix + tier filename, so the writer, deleter, and
 * guard can't drift. Sibling of the guarded file inside the epoch folder
 * — it follows a `scalarFieldFormat` VERSION bump automatically. Never
 * matched by `allowDataFile`, so it is not hashed, manifested, or synced.
 */
import { SCALAR_FIELD_DATA_PREFIX } from '../../../src/data/volume/scalarFieldFormat';
import { MCPM_TIER_FILENAME } from '../../volumes/buildMcpmVolume';

export function quickLookSentinelPath(dataDir: string): string {
  return `${dataDir}/${SCALAR_FIELD_DATA_PREFIX}/${MCPM_TIER_FILENAME[2]}.quicklook`;
}
