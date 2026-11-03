/**
 * The one home of the source gate shared by `starCutInputs` and `starCatalogVisible`:
 * loaded survey catalogs whose handed value times crossfade at `camDistPc` is > 0.
 */

import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import type { StarSourceInBand } from '../../@types/StarSourceInBand';
import { STAR_CATALOG_SOURCE_RECORD } from '../../sources/starCatalogSourceRecord';
import { starSourceDrawOpacity } from '../../utils/star/starSourceDrawOpacity';

export function starSourcesInBand(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  fade: Readonly<Record<StarCatalogId, number>>,
  camDistPc: number,
): readonly StarSourceInBand[] {
  const result: StarSourceInBand[] = [];
  for (const { source } of runtime.renderer.loadedCatalogs()) {
    const entry = STAR_CATALOG_SOURCE_RECORD[source];
    if (entry.binBaseName === null) continue;
    const crossfade = starSourceDrawOpacity(entry, fade, camDistPc);
    if (crossfade > 0) result.push({ source, entry, crossfade });
  }
  return result;
}
