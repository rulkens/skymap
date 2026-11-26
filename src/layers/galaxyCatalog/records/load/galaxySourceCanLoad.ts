/**
 * Whether a galaxy source can ever become resident right now. Mirrors its asset row in
 * `galaxyCatalogAssetRows.ts` (`demand.tiers` + `gates`) so the selection bridge can stop
 * waiting on a source that will never load. The famous catalog's row demands `'always'`.
 */

import type { GalaxyCatalogId } from '../../@types/GalaxyCatalogId';
import type { Tier } from '../../../../../packages/shared/src/@types/data/Tier';
import type { EngineSettingsState } from '../../../../@types/settings/EngineSettingsState';
import { tierTarget } from '../data/tierTargets';
import { galaxyCatalogVisibility } from '../../visibility';
import { visibilitySwitchOf } from '../../../../utils/visibility/visibilitySwitchOf';

const surveyEntry = galaxyCatalogVisibility.find((e) => 'key' in e && e.key === 'survey')!;

export function galaxySourceCanLoad(
  id: GalaxyCatalogId,
  tier: Tier,
  settings: EngineSettingsState,
): boolean {
  if (id === 'famousGalaxy') return true;
  return tierTarget(id, tier) !== 0 && visibilitySwitchOf(settings, surveyEntry, id);
}
