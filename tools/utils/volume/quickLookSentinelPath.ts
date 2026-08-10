/**
 * Path of the quick-look sentinel: written when a `--quick-look` PolyPhy
 * run overwrites `mcpm-large.scfd` with a calibration cube, checked by
 * `assertNoQuickLookSentinel`, deleted once `buildMcpmTier` rebuilds the
 * real reference. One home for the `.quicklook` suffix + tier filename so
 * writer, deleter and guard can never drift apart on the name.
 */
import { MCPM_TIER_FILENAME } from '../../volumes/buildMcpmVolume';

export function quickLookSentinelPath(dataDir: string): string {
  return `${dataDir}/${MCPM_TIER_FILENAME[2]}.quicklook`;
}
