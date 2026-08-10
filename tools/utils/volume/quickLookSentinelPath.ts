/**
 * Path of the quick-look sentinel: one shared home for the `.quicklook`
 * suffix + tier filename, so the writer, deleter, and guard can't drift.
 */
import { MCPM_TIER_FILENAME } from '../../volumes/buildMcpmVolume';

export function quickLookSentinelPath(dataDir: string): string {
  return `${dataDir}/${MCPM_TIER_FILENAME[2]}.quicklook`;
}
