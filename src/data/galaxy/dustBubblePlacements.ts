/**
 * buildDustBubblePlacements — the SF-event catalog's bubble subset, resolved
 * to world centres and physical radii: the ONE placement both the flat
 * dust-feature tier (rim/hole rendering) and the particle cloud (bubble
 * carving) read, so a bubble sits in the same place in both.
 *
 * PURITY INVARIANT: pure `(geometry, dust, seed) -> flat data`, no engine
 * state, no Math.random — same discipline as `sfEventCatalog.ts`.
 */
import { armFadeEnvelope, armRidgeAngle, armRidgeCurvePoint } from './armRidgeGeometry';
import { armAgeWeight, armLaneWidthAndAmplitude } from './dustLaneFeatures';
import { buildSfEventCatalog } from './sfEventCatalog';
import { warpSurfaceFrame } from '../../utils/galaxy/warpSurfaceFrame';
import type { GalaxyDustParams } from '../../@types/galaxy/GalaxyDustParams';
import type { GalaxyFieldGeometry } from '../../@types/galaxy/GalaxyFieldGeometry';
import type { Vec3 } from '../../@types/math/Vec3';

/** age01 <= this gate are future HII knots (#20), not yet swept dust cavities — see `SfEvent.age01`'s own doc. */
const BUBBLE_AGE_GATE = 0.35;

/** Third priority (N2 #3) in the flat feature budget; also this module's own placement cap — bubbles are sparse, large-footprint features. */
export const BUBBLE_BUDGET = 120;

/** 1 generator unit = 1.6667 kpc — `galacticCenter.ts`'s own conversion, restated here to turn pc-scale literature radii into world units. */
const KPC_PER_UNIT = 1.6667;
export function pcToUnits(pc: number): number {
  return pc / (KPC_PER_UNIT * 1000);
}

export type DustBubblePlacement = {
  readonly center: Vec3;
  readonly radius: number;
};

/** Placement plus the arm-local shading truth `dustNetworkFeatures.ts` needs for a rim/hole record — `laneAmplitude` already folds in age weight and radial fade, so it doesn't need to recompute either. */
export type DustBubblePlacementDetail = DustBubblePlacement & {
  readonly pole: Vec3;
  readonly laneAmplitude: number;
};

/**
 * buildDustBubblePlacementDetails — the flat feature tier's own entry point;
 * `buildDustBubblePlacements` below strips this down to the particle cloud's
 * plain center/radius contract.
 */
export function buildDustBubblePlacementDetails(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): readonly DustBubblePlacementDetail[] {
  if (dust.tau <= 0 || geometry.numArms <= 0 || dust.network.bubbleScale <= 0) return [];

  const events = buildSfEventCatalog(geometry, dust.network, seed);
  const out: DustBubblePlacementDetail[] = [];
  for (const event of events) {
    if (event.age01 <= BUBBLE_AGE_GATE) continue;
    const arm = geometry.arms[event.armIndex];
    if (!arm) continue;

    const armRadius = geometry.armStartRadius * Math.exp(event.logR);
    const angle = armRidgeAngle(event.logR, geometry, arm);
    const ridge = armRidgeCurvePoint(event.logR, geometry, arm);
    const frame = warpSurfaceFrame(armRadius, angle, geometry);
    // ON the warp surface: `frame.across` is a tangent to the warped disc at
    // this point (not a flat horizontal offset), the same technique the
    // lane/spur curve uses for its own offset points.
    const center: Vec3 = [
      ridge[0] + frame.across[0] * event.acrossOffset,
      ridge[1] + frame.across[1] * event.acrossOffset,
      ridge[2] + frame.across[2] * event.acrossOffset,
    ];

    const age01n = (event.age01 - BUBBLE_AGE_GATE) / (1 - BUBBLE_AGE_GATE);
    // Quadratic-plus bias approximating the measured -2.2 size power law's
    // many-small/few-big shape from the catalog's own UNIFORM age draws —
    // not a resampled power-law distribution.
    const radiusPc = 6 + 546 * Math.pow(age01n, 2.5);
    const radius = pcToUnits(radiusPc) * dust.network.bubbleScale;
    if (radius <= 0) continue;

    const fade = armFadeEnvelope(armRadius, geometry, arm);
    const ageWeight = armAgeWeight(arm);
    const { amplitude: laneAmplitude } = armLaneWidthAndAmplitude(
      armRadius,
      geometry,
      dust,
      ageWeight,
      fade,
    );
    if (laneAmplitude <= 0) continue;

    out.push({ center, radius, pole: frame.pole, laneAmplitude });
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

export function buildDustBubblePlacements(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): readonly DustBubblePlacement[] {
  return buildDustBubblePlacementDetails(geometry, dust, seed).map(({ center, radius }) => ({
    center,
    radius,
  }));
}
