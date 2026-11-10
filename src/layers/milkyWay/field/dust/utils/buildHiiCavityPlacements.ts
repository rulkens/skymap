import {
  HII_AGE_GATE,
  hiiLuminosityOf,
  hiiRadiusUnits,
} from '../../starFormation/utils/hiiRegionGeometry';
import { buildSfEventCatalog } from '../../starFormation/utils/sfEventCatalog';
import type { GalaxyDustParams } from '../@types/GalaxyDustParams';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { GalaxyStarFormationParams } from '../../starFormation/@types/GalaxyStarFormationParams';
import { DustBubblePlacement } from '../@types/DustBubblePlacement';
import { armReaches } from './armReaches';
import { armEventCenter } from './armEventCenter';
import { HII_CAVITY_BUDGET } from '../data/hiiCavityBudget';

/**
 * The dust-side twin of the HII knots `hiiRegions.ts` draws for the same
 * young events (`age01 <= HII_AGE_GATE`): the hole a still-forming region
 * blows in the dust, sized off the SAME luminosity/radius law as its glow
 * so the cavity and the shell that lights it agree. A separate list from
 * `buildDustBubblePlacements` — old relic bubbles stay independently
 * reachable and toggleable.
 */
export function buildHiiCavityPlacements(
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
  starFormation: GalaxyStarFormationParams,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly DustBubblePlacement[] {
  // `cavityScale` moved from `hii` root onto `hii.shells`; a preset saved
  // with a partial `shells` bag can re-enter missing it (same idiom as
  // `hiiRegions.ts`'s `radiusScale`/`shellThickness` holes).
  const cavityScale = tuning.hii.shells.cavityScale ?? 0.8;
  if (!tuning.hii.enabled || cavityScale <= 0) return [];
  if (dust.tau <= 0 || geometry.numArms <= 0) return [];

  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  const out: DustBubblePlacement[] = [];
  for (const event of events) {
    if (event.age01 > HII_AGE_GATE) continue;
    const arm = geometry.arms[event.armIndex];
    if (!arm) continue;

    const { center, armRadius } = armEventCenter(event, geometry, arm);

    const radius =
      hiiRadiusUnits(hiiLuminosityOf(event), tuning.hii.shells.radiusScale ?? 1) * cavityScale;
    if (radius <= 0) continue;

    if (!armReaches(armRadius, geometry, arm)) continue;

    out.push({ center, radius });
  }

  if (out.length > HII_CAVITY_BUDGET) {
    out.sort((a, b) => b.radius - a.radius);
    return out.slice(0, HII_CAVITY_BUDGET);
  }
  return out;
}
