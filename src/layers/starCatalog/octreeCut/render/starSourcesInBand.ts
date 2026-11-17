/**
 * The one home of the source gate shared by `starCutInputs` and `starCatalogVisible`:
 * loaded survey catalogs whose handed value is > 0. That value already carries the
 * entry's `survey` band at this view, so it is the far gate too.
 */

import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import type { StarSourceInBand } from '../@types/StarSourceInBand';
import { STAR_CATALOG_SOURCE_RECORD } from '../../sources/starCatalogSourceRecord';

export function starSourcesInBand(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  fade: Readonly<Record<StarCatalogId, number>>,
): readonly StarSourceInBand[] {
  const result: StarSourceInBand[] = [];
  for (const { source } of runtime.renderer.loadedCatalogs()) {
    const entry = STAR_CATALOG_SOURCE_RECORD[source];
    if (entry.binBaseName === null) continue;
    const opacity = fade[entry.id];
    if (opacity > 0) result.push({ source, entry, opacity });
  }
  return result;
}
