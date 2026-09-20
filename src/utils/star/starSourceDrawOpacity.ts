import type { SourceEntry } from '../../@types/data/SourceEntry';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogSettings } from '../../@types/settings/StarCatalogSettings';
import { starCrossfadeOpacity } from './starCrossfadeOpacity';

/**
 * How much one source contributes to the star cut this frame — `0` ⇒ nothing,
 * so an additive draw of it would be invisible. The single home of the
 * per-source draw decision: `starCatalogVisible` asks whether ANY source is
 * above 0 without walking an octree, `computeStarCut` uses the value as the
 * node opacity multiplier. Two readers, one predicate, no drift.
 */
export function starSourceDrawOpacity(
  entry: SourceEntry,
  settings: StarCatalogSettings,
  camDistPc: number,
): number {
  // Only a SURVEY row ships a bin, so only it can be loaded and drawn.
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) return 0;
  // `SourceEntryBase.id` widens to `string`; a `starCatalog` row's id is a
  // `StarCatalogId` by construction of `SOURCE_REGISTRY`, which is where the
  // literal survives. Callers passing a registry row cannot violate this.
  if (!settings.items[entry.id as StarCatalogId].enabled) return 0;
  return starCrossfadeOpacity(entry.crossfadePc, camDistPc);
}
