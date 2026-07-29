/**
 * milkyWayProbe — TEMPORARY SPIKE CODE. Delete before merge.
 *
 * A URL override for the Milky Way point cloud's STAR BUDGET, so the
 * count/size tradeoff behind "does the star field read as a smooth galaxy or
 * as visible particles?" can be explored without editing constants.
 *
 * ## Why the count knob alone stayed URL-driven
 *
 * The cloud's LOOK knobs (sprite size, exposure, px clamp, profile softness,
 * LOD) are live settings now — `settings.milkyWay`, driven by the DebugPanel's
 * "Milky Way tuning" sliders. The count is not, and can't join them as-is: it
 * feeds GENERATION (`milkyWayCloud.generate` carves the star/dust layouts and
 * allocates buffers from it), not the per-frame uniforms, so a slider over it
 * would silently do nothing until the next tier switch. A page load is the
 * honest granularity for it, which is what this file is.
 *
 * ## Params
 *
 *   mwCount  multiplier on the tier star budget   default 1
 *
 * Note that `splitStarBudget` clamps the total to 20,000 stars, so a
 * `mwCount` small enough to fall under that floor quietly renders at the floor.
 *
 * ## Celestia-end starting point
 *
 *   ?mwCount=0.05
 *
 * ~7.5k splats. Then, in the DebugPanel: starSize way up, exposure way down to
 * compensate (it is absolute — nothing dims it for you), lod to 0 (it culls and
 * 3x-boosts survivors, which manufactures exactly the graininess under test),
 * softness to 1 for the broad Gaussian profile.
 */

export type MilkyWayProbe = {
  /** Multiplier on the tier's star budget, applied at generation time. */
  readonly countScale: number;
};

function num(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Parsed once per page load — this is a load-time experiment knob, not a live
// setting, and it only takes effect at generation anyway.
let cached: MilkyWayProbe | null = null;

export function milkyWayProbe(): MilkyWayProbe {
  if (cached !== null) return cached;

  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

  // Guard against 0 or negative: a zero star budget is not a meaningful probe.
  cached = { countScale: Math.max(1e-4, num(params, 'mwCount', 1)) };
  return cached;
}
