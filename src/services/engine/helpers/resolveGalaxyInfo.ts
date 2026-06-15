/**
 * resolveGalaxyInfo — turn a `(cloud, localIdx, source)` selection into a
 * `GalaxyInfo`, or `null` when the pick can't be resolved.
 *
 * This is the pure core of the selection subsystem's galaxy lookup: every
 * dependency arrives as an argument (the live cloud, the decoded local index,
 * the source tag, the optional famous sidecar), so it captures no closures and
 * can be unit-tested in isolation.
 *
 * The bounds check defends the tier-swap-window race.  A still-in-flight pick
 * from a previous frame can carry a `(source, localIdx)` decoded against an
 * older, larger layout; if the cloud has since been swapped to a smaller tier,
 * `buildGalaxyInfo` would index past the end of the freshly-uploaded typed
 * arrays and crash downstream `.toFixed()` calls in the InfoCard.  Returning
 * `null` is the right semantics — "we have no data for that pick; render no
 * card, the next frame's pick will succeed".
 */

import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../@types/data/SourceType';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import { buildGalaxyInfo } from './galaxyInfoBuilder';

export function resolveGalaxyInfo(
  cloud: GalaxyCatalog | undefined,
  localIdx: number,
  source: SourceType,
  famousMeta?: readonly FamousMetaEntry[],
): GalaxyInfo | null {
  if (!cloud) return null;
  if (localIdx < 0 || localIdx >= cloud.count) return null;
  return buildGalaxyInfo(cloud, localIdx, source, famousMeta);
}
