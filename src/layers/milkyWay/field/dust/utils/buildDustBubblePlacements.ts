/**
 * buildDustBubblePlacements — the SF-event catalog's bubble subset, resolved
 * to the world centres and physical radii the particle cloud carves its
 * cavities against.
 *
 * PURITY INVARIANT: pure `(geometry, dust, starFormation, seed) -> flat
 * data`, no engine state, no Math.random — same discipline as
 * `sfEventCatalog.ts`.
 */
import { HII_AGE_GATE } from '../../starFormation/utils/hiiRegionGeometry';
import { buildSfEventCatalog } from '../../starFormation/utils/sfEventCatalog';
import { pcToUnits } from '../../mixture/utils/pcToUnits';
import type { GalaxyDustParams } from '../@types/GalaxyDustParams';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../mixture/@types/GalaxyFieldTuning';
import type { GalaxyStarFormationParams } from '../../starFormation/@types/GalaxyStarFormationParams';
import { DustBubblePlacement } from '../@types/DustBubblePlacement';
import { armReaches } from './armReaches';
import { armEventCenter } from './armEventCenter';
import { BUBBLE_BUDGET } from '../data/bubbleBudget';

/** Fixed at 1, not exposed as a slider — kept as a single multiplication point rather than inlining `1` at both use sites below. */
const BUBBLE_RADIUS_SCALE = 1;

export function buildDustBubblePlacements(
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
  starFormation: GalaxyStarFormationParams,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly DustBubblePlacement[] {
  if (dust.tau <= 0 || geometry.numArms <= 0 || BUBBLE_RADIUS_SCALE <= 0) return [];

  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  const out: DustBubblePlacement[] = [];
  for (const event of events) {
    if (event.age01 <= HII_AGE_GATE) continue;
    const arm = geometry.arms[event.armIndex];
    if (!arm) continue;

    const { center, armRadius } = armEventCenter(event, geometry, arm);

    const age01n = (event.age01 - HII_AGE_GATE) / (1 - HII_AGE_GATE);
    // Quadratic-plus bias approximating the measured -2.2 size power law's
    // many-small/few-big shape from the catalog's own UNIFORM age draws —
    // not a resampled power-law distribution.
    const radiusPc = 6 + 546 * Math.pow(age01n, 2.5);
    const radius = pcToUnits(radiusPc) * BUBBLE_RADIUS_SCALE;
    if (radius <= 0) continue;

    if (!armReaches(armRadius, geometry, arm)) continue;

    out.push({ center, radius });
  }

  // Budget: over BUBBLE_BUDGET, keep the LARGEST radii — small bubbles
  // vanish first, matching how a resolution-limited budget resolves
  // visually (the smallest are what a viewer loses to pixel scale anyway).
  if (out.length > BUBBLE_BUDGET) {
    out.sort((a, b) => b.radius - a.radius);
    return out.slice(0, BUBBLE_BUDGET);
  }
  return out;
}
