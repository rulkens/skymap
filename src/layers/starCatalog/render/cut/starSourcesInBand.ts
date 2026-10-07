/**
 * The one home of the two-part source gate shared by `starCutFrame` and
 * `starCatalogVisible`. Loaded survey catalogs whose crossfade at `camDistPc` is > 0; empty when
 * the master toggle is off.
 */

import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import type { StarSourceInBand } from '../../@types/StarSourceInBand';
import { SOURCE_REGISTRY } from '../../../../data/sources';
import { starSourceDrawOpacity } from '../../../../utils/star/starSourceDrawOpacity';

export function starSourcesInBand(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  settings: StarCatalogSettings,
  camDistPc: number,
): readonly StarSourceInBand[] {
  if (!settings.enabled) return [];

  const result: StarSourceInBand[] = [];
  for (const { source } of runtime.renderer.loadedCatalogs()) {
    const entry = SOURCE_REGISTRY[source];
    if (entry.type !== 'starCatalog' || entry.binBaseName === null) continue;
    const crossfade = starSourceDrawOpacity(entry, settings, camDistPc);
    if (crossfade > 0) result.push({ source, entry, crossfade });
  }
  return result;
}
