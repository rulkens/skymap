/**
 * buildDustBubblePlacements — the SF-event catalog's bubble subset, resolved
 * to the world centres and physical radii the particle cloud carves its
 * cavities against.
 *
 * PURITY INVARIANT: pure `(geometry, dust, starFormation, seed) -> flat
 * data`, no engine state, no Math.random — same discipline as
 * `sfEventCatalog.ts`.
 */
import { armFadeEnvelope, armRidgeAngle, armRidgeCurvePoint } from './armRidgeGeometry';
import { HII_AGE_GATE, hiiLuminosityOf, hiiRadiusUnits } from './hiiRegionGeometry';
import { buildSfEventCatalog } from './sfEventCatalog';
import { pcToUnits } from '../../../../utils/galaxy/pcToUnits';
import { warpSurfaceFrame } from '../../../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyDustParams } from '../../../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxyStarFormationParams } from '../../../../@types/galaxy/GalaxyStarFormationParams';
import type { SfEvent } from '../../../../@types/galaxy/SfEvent';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** Placement cap — bubbles are sparse, large-footprint features. */
export const BUBBLE_BUDGET = 120;

/** Same spirit as `BUBBLE_BUDGET`, kept separate since the young population's own count is independently tuned. */
export const HII_CAVITY_BUDGET = 120;

export type DustBubblePlacement = {
  readonly center: Vec3;
  readonly radius: number;
};

/**
 * World centre of one SF event on its arm's warped surface — shared by the
 * bubble and HII-cavity builders so a placement fix in one can't silently
 * diverge from the other.
 */
function armEventCenter(
  event: Pick<SfEvent, 'logR' | 'acrossOffset'>,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): { readonly center: Vec3; readonly armRadius: number } {
  const armRadius = geometry.armStartRadius * Math.exp(event.logR);
  const angle = armRidgeAngle(event.logR, geometry, arm);
  const ridge = armRidgeCurvePoint(event.logR, geometry, arm);
  const frame = warpSurfaceFrame(armRadius, angle, geometry);
  // ON the warp surface: `frame.across` is a tangent to the warped disc at
  // this point, not a flat horizontal offset.
  const center: Vec3 = [
    ridge[0] + frame.across[0] * event.acrossOffset,
    ridge[1] + frame.across[1] * event.acrossOffset,
    ridge[2] + frame.across[2] * event.acrossOffset,
  ];
  return { center, armRadius };
}

/**
 * An event only carves where its arm actually reaches: past the fade envelope
 * there is no arm to sweep dust out of. This used to route through the lane
 * ledger's amplitude, but every other factor in that product (age weight, lane
 * width, carried column) is strictly positive wherever tau is — so the fade
 * was the only thing the gate ever tested.
 */
function armReaches(
  armRadius: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): boolean {
  return armFadeEnvelope(armRadius, geometry, arm) > 0;
}

export function buildDustBubblePlacements(
  geometry: GalaxyDescription,
  dust: GalaxyDustParams,
  starFormation: GalaxyStarFormationParams,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly DustBubblePlacement[] {
  if (dust.tau <= 0 || geometry.numArms <= 0 || starFormation.bubbleScale <= 0) return [];

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
    const radius = pcToUnits(radiusPc) * starFormation.bubbleScale;
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
  if (!tuning.hiiEnabled || tuning.hiiCavityScale <= 0) return [];
  if (dust.tau <= 0 || geometry.numArms <= 0) return [];

  const events = buildSfEventCatalog(geometry, starFormation, tuning, seed);
  const out: DustBubblePlacement[] = [];
  for (const event of events) {
    if (event.age01 > HII_AGE_GATE) continue;
    const arm = geometry.arms[event.armIndex];
    if (!arm) continue;

    const { center, armRadius } = armEventCenter(event, geometry, arm);

    const radius =
      hiiRadiusUnits(hiiLuminosityOf(event), tuning.hiiRadiusScale) * tuning.hiiCavityScale;
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
