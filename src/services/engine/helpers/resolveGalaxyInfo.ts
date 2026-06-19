/**
 * resolveGalaxyInfo — composes the engine-side cloud read (`extractGalaxyRow`)
 * with the pure formatter (`buildGalaxyInfo`). The pick path calls this to
 * produce a `GalaxyInfo` that is then dispatched into the selection slice;
 * the bounds/null guard lives in extractGalaxyRow.
 *
 * The `source` param is typed `SourceType` to match the caller (`resolvePickTable`
 * passes `pick.sourceCode`, which is `SourceType`). The cast to
 * `GalaxyCatalogSourceType` is sound at this call site because `resolvePickTable`
 * only reaches this arm when the registry entry has `type: 'galaxyCatalog'`,
 * which guarantees the source code is a galaxy-catalog source. A later task
 * will push that narrowing into the type of `pick.sourceCode` so the cast can
 * be removed.
 */

import { extractGalaxyRow } from './extractGalaxyRow';
import { buildGalaxyInfo } from './buildGalaxyInfo';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogSourceType } from '../../../@types/data/galaxyCatalog/GalaxyCatalogSourceType';
import type { SourceType } from '../../../@types/data/SourceType';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';

export function resolveGalaxyInfo(
  cloud: GalaxyCatalog | undefined,
  localIdx: number,
  source: SourceType,
  famousMeta?: readonly FamousMetaEntry[],
): GalaxyInfo | null {
  const row = extractGalaxyRow(cloud, localIdx, source as GalaxyCatalogSourceType, famousMeta);
  return row ? buildGalaxyInfo(row) : null;
}
