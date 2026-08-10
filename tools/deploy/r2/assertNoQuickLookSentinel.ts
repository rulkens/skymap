/**
 * Refuses to sync while a quick-look calibration cube sits at
 * `mcpm-large.scfd` — that filename passes `allowDataFile`'s allow-list, so
 * a forgotten `npm run build-mcpm` after a `--quick-look` run would ship
 * the reproduced cube to production as the MCPM reference. Called from
 * syncR2's pre-flight block, before any byte moves.
 */
import { existsSync } from 'node:fs';
import { quickLookSentinelPath } from '../../utils/volume/quickLookSentinelPath';

export function assertNoQuickLookSentinel(dataDir: string): void {
  if (existsSync(quickLookSentinelPath(dataDir))) {
    throw new Error(
      'assertNoQuickLookSentinel: mcpm-large.scfd was last written by a --quick-look run ' +
        '(sentinel file present) — run `npm run build-mcpm` to rebuild the real reference ' +
        'before syncing.',
    );
  }
}
