/**
 * The one home of the source gate shared by `starCutInputs` and `starCatalogVisible`:
 * loaded survey catalogs whose handed value times crossfade at `camDistPc` is > 0.
 */

import type { StarCatalogId } from '../../../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import type { StarSourceInBand } from '../../@types/StarSourceInBand';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { starSourceDrawOpacity } from '../../../../utils/star/starSourceDrawOpacity';

export function starSourcesInBand(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  fade: Readonly<Record<StarCatalogId, number>>,
  camDistPc: number,
): readonly StarSourceInBand[] {
  const result: StarSourceInBand[] = [];
  for (const { source } of runtime.renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;
    const crossfade = starSourceDrawOpacity(entry, fade, camDistPc);
    if (crossfade > 0) result.push({ source, entry, crossfade });
  }
  return result;
}
