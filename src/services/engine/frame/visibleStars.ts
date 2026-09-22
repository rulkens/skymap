/**
 * visibleStars — the seeded star set the near-field star layers actually draw
 * this frame, each row tagged with the source and seed index it came from.
 *
 * Both star content rows (`starPointsPass`, `starSpheresPass`) feed their
 * `partitionStarsByResolution` call this set, so the gates are honoured in ONE
 * place shared across all four call sites, keeping the enable gate and the
 * drawn set from ever disagreeing.
 *
 * A catalog is drawn iff the cluster master AND its own item are on — both
 * halves for every seeded source alike, no exemption table, because a star
 * catalog's visibility is a two-level fact everywhere else in the engine (the
 * asset-demand predicate and `starCatalogPass` compose the same pair). The
 * Stars panel derives its header tri-state over every star-catalog id, so a
 * master governing only part of its cluster would claim authority it lacked.
 * The walk covers the ≤250 static seed rows, cheap enough per frame.
 */

import type { StarBody } from '../../../@types/scene/StarBody';
import type { StarCatalogSettings } from '../../../@types/settings/StarCatalogSettings';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { SeededStarCatalogId } from '../../../@types/data/starCatalog/SeededStarCatalogId';
import { SEEDED_STAR_CATALOGS } from '../../../data/bodies/seededStarCatalogs';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';

const SEEDED_ROWS: readonly {
  readonly id: SeededStarCatalogId;
  readonly source: StarCatalogSourceType;
  readonly stars: readonly StarBody[];
}[] = SOURCE_ENTRIES.filter(
  (entry) => entry.type === 'starCatalog' && entry.binBaseName === null,
).map((entry) => ({
  id: entry.id as SeededStarCatalogId,
  source: entry.code as StarCatalogSourceType,
  stars: SEEDED_STAR_CATALOGS[entry.id as SeededStarCatalogId],
}));

export function visibleStars(
  settings: StarCatalogSettings,
): readonly (StarBody & { source: StarCatalogSourceType; seedIndex: number })[] {
  if (!settings.enabled) return [];
  const drawn: (StarBody & { source: StarCatalogSourceType; seedIndex: number })[] = [];
  for (const row of SEEDED_ROWS) {
    if (!settings.items[row.id].enabled) continue;
    row.stars.forEach((star, seedIndex) => drawn.push({ ...star, source: row.source, seedIndex }));
  }
  return drawn;
}
