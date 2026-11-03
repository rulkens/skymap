import type { SurveyStarCatalogSourceEntry } from '../../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';
import type { StarCatalogId } from '../../@types/StarCatalogId';
import { starCrossfadeOpacity } from './starCrossfadeOpacity';

/**
 * How much one source contributes to the star cut this frame — its handed value times
 * its distance crossfade; `0` ⇒ nothing, so an additive draw of it would be invisible. The single home of the
 * per-source draw decision: `starCatalogVisible` asks whether ANY source is
 * above 0, `starCutInputs` hands the value to the
 * GPU cut as the source's opacity multiplier. Two readers, one predicate, no drift.
 */
export function starSourceDrawOpacity(
  entry: Pick<SurveyStarCatalogSourceEntry, 'crossfadePc'> & { readonly id: StarCatalogId },
  fade: Readonly<Record<StarCatalogId, number>>,
  camDistPc: number,
): number {
  return fade[entry.id] * starCrossfadeOpacity(entry.crossfadePc, camDistPc);
}
