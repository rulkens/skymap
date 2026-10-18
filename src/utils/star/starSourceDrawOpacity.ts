import type { SourceEntry } from '../../@types/data/SourceEntry';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import { starCrossfadeOpacity } from './starCrossfadeOpacity';

/**
 * How much one source contributes to the star cut this frame — its handed value times
 * its distance crossfade; `0` ⇒ nothing, so an additive draw of it would be invisible. The single home of the
 * per-source draw decision: `starCatalogVisible` asks whether ANY source is
 * above 0, `starCutInputs` hands the value to the
 * GPU cut as the source's opacity multiplier. Two readers, one predicate, no drift.
 */
export function starSourceDrawOpacity(
  entry: SourceEntry,
  fade: Readonly<Record<StarCatalogId, number>>,
  camDistPc: number,
): number {
  // Only a SURVEY row ships a bin, so only it can be loaded and drawn.
  if (entry.type !== 'starCatalog' || entry.binBaseName === null) return 0;
  // `SourceEntryBase.id` widens to `string`; a `starCatalog` row's id is a
  // `StarCatalogId` by construction of `SOURCE_REGISTRY`, which is where the
  // literal survives. Callers passing a registry row cannot violate this.
  return fade[entry.id as StarCatalogId] * starCrossfadeOpacity(entry.crossfadePc, camDistPc);
}
