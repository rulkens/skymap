/**
 * visibleStars — the seeded star set the near-field star layers draw this
 * frame, tagged with source + seed index. `starPointsPass`/`starSpheresPass`
 * both feed this through `partitionStarsByResolution`, so the enable gate and
 * the drawn set never disagree — drawn iff the cluster master AND its own
 * item are on, the same two-part gate `starCatalogPass` composes.
 */

import type { StarBody } from '../../../@types/scene/StarBody';
import type { StarCatalogSettings } from '../../../@types/settings/StarCatalogSettings';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';

export function visibleStars(
  settings: StarCatalogSettings,
): readonly (StarBody & { source: StarCatalogSourceType; seedIndex: number })[] {
  if (!settings.enabled) return [];
  const drawn: (StarBody & { source: StarCatalogSourceType; seedIndex: number })[] = [];
  for (const [source, row] of SEEDED_STAR_CATALOGS_BY_SOURCE) {
    if (!settings.items[row.id].enabled) continue;
    row.stars.forEach((star, seedIndex) => drawn.push({ ...star, source, seedIndex }));
  }
  return drawn;
}
