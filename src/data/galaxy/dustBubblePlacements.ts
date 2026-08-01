/**
 * buildDustBubblePlacements — the SF-event catalog's bubble subset, resolved
 * to the world centres and physical radii the particle cloud carves its
 * cavities against.
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

/** Placement cap — bubbles are sparse, large-footprint features. */
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

export function buildDustBubblePlacements(
  geometry: GalaxyFieldGeometry,
  dust: GalaxyDustParams,
  seed: number,
): readonly DustBubblePlacement[] {
  if (dust.tau <= 0 || geometry.numArms <= 0 || dust.cloud.bubbleScale <= 0) return [];

  const events = buildSfEventCatalog(geometry, dust.cloud, seed);
  const out: DustBubblePlacement[] = [];
  for (const event of events) {
    if (event.age01 <= BUBBLE_AGE_GATE) continue;
    const arm = geometry.arms[event.armIndex];
    if (!arm) continue;

    const armRadius = geometry.armStartRadius * Math.exp(event.logR);
    const angle = armRidgeAngle(event.logR, geometry, arm);
    const ridge = armRidgeCurvePoint(event.logR, geometry, arm);
    const frame = warpSurfaceFrame(armRadius, angle, geometry);
    // ON the warp surface: `frame.across` is a tangent to the warped disc at
    // this point (not a flat horizontal offset), the same technique
    // `armOffsetFrameAt` uses for its own offset points.
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
    const radius = pcToUnits(radiusPc) * dust.cloud.bubbleScale;
    if (radius <= 0) continue;

    // A bubble only exists where the arm actually carries dust to sweep: the
    // lane amplitude folds in this arm's age weight and its radial fade, so
    // a zero there means an event past the arm's own reach, not a small one.
    const fade = armFadeEnvelope(armRadius, geometry, arm);
    const { amplitude: laneAmplitude } = armLaneWidthAndAmplitude(
      armRadius,
      geometry,
      dust,
      armAgeWeight(arm),
      fade,
    );
    if (laneAmplitude <= 0) continue;

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
