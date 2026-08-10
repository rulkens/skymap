/**
 * Refuses to sync while a quick-look calibration cube sits at the shipped
 * MCPM large-tier .scfd — that filename passes `allowDataFile`'s allow-list,
 * so a forgotten `npm run build-mcpm` after a `--quick-look` run would ship
 * the reproduced cube to production as the MCPM reference. Called from
 * syncR2's pre-flight block, before any byte moves.
 */
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { quickLookSentinelPath } from '../../utils/volume/quickLookSentinelPath';

export function assertNoQuickLookSentinel(dataDir: string): void {
  const sentinelPath = quickLookSentinelPath(dataDir);
  if (existsSync(sentinelPath)) {
    // Derived, not hardcoded — stays correct if the tier filename ever changes.
    const targetName = basename(sentinelPath, '.quicklook');
    throw new Error(
      `assertNoQuickLookSentinel: ${targetName} was last written by a --quick-look run ` +
        '(sentinel file present) — run `npm run build-mcpm` to rebuild the real reference ' +
        'before syncing.',
    );
  }
}
