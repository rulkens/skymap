/**
 * pickSpiralCorridorStars — snap real stars onto an ideal spiral. Given the
 * spiral's sample points (see `sampleConicalSpiral`) and a candidate star list,
 * it walks the samples in order and, for each, claims the *brightest* not-yet-
 * claimed star lying inside that sample's corridor — a ball whose radius scales
 * with the sample's distance from the origin. A sample whose corridor is empty is
 * skipped, so the result is the ordered subsequence of samples that found a star.
 *
 * ── Why a distance-scaled corridor, not a fixed one ────────────────────────
 *
 * Stellar density falls off with distance from the Sun, and the spiral's own
 * sample spacing widens as it climbs out (its radius grows geometrically). A
 * fixed-width tube would over-collect in the dense inner field and starve in the
 * sparse outer field. Scaling the corridor by `corridorFrac × |sample|` keeps the
 * search volume proportional to the local scale, so the snap grabs roughly one
 * star per sample across the whole path rather than clustering all its picks near
 * the Sun.
 *
 * ── Brightest-wins, claim-once, in-order ───────────────────────────────────
 *
 * Two entangled jobs are kept apart. The corridor decides *which* stars are
 * eligible for a sample; among the eligible, brightness (lower `absMag`) decides
 * *which one* is taken. A star, once claimed, is removed from play so a later
 * sample can't re-pick it — otherwise a single bright star sitting between two
 * samples would be chosen twice and the path would double back on itself. The
 * output preserves sample order, which is the spiral's outward winding, so the
 * camera visits picks from the Sun outward.
 *
 * ── The minimum-leg guard ───────────────────────────────────────────────────
 *
 * Even with arc-length-uniform samples, two adjacent corridors can both reach the
 * same tiny knot of near-coincident stars, so successive picks can land a
 * fraction of a parsec apart — a near-cusp the camera slams through. `minLegPc`
 * removes any candidate closer than that distance to the PREVIOUSLY PICKED star
 * from eligibility, so every consecutive pair of picks is at least `minLegPc`
 * apart. A sample whose only in-corridor stars are all too close to the last pick
 * falls through empty (it contributes nothing) rather than picking a cusp.
 *
 * ── Purity and determinism ─────────────────────────────────────────────────
 *
 * No randomness and no I/O: the pick is a total function of the samples, the
 * candidate list, and `corridorFrac`. Ties in `absMag` resolve to the
 * lowest-index candidate (a strict `<` never displaces an equal incumbent), so a
 * deterministically-ordered candidate list yields a byte-identical pick — the
 * property the generated waypoint file's reproducibility rests on. Generic over
 * the candidate shape so callers can thread identity (a famous-star id, a name)
 * through untouched; the picker reads only `posPc` and `absMag`.
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';

export type CorridorCandidate = {
  /** Heliocentric position in parsecs (same frame as the spiral samples). */
  readonly posPc: Vec3;
  /** Absolute magnitude — lower is brighter, the pick's ranking key. */
  readonly absMag: number;
};

export type CorridorPickOptions<C extends CorridorCandidate> = {
  /** The ideal spiral's sample points, walked in order (heliocentric parsecs). */
  readonly samples: readonly Vec3[];
  /** Candidate stars; deterministic order fixes tie-breaks and the output. */
  readonly candidates: readonly C[];
  /** Corridor radius as a fraction of each sample's distance from the origin. */
  readonly corridorFrac: number;
  /**
   * Minimum distance (same unit as the positions) a pick must sit from the
   * previously picked star. Candidates closer than this to the last pick are
   * ineligible, so consecutive picks are never nearer than `minLegPc`. Defaults
   * to 0 (no guard) when omitted.
   */
  readonly minLegPc?: number;
};

export function pickSpiralCorridorStars<C extends CorridorCandidate>(
  opts: CorridorPickOptions<C>,
): C[] {
  const { samples, candidates, corridorFrac, minLegPc = 0 } = opts;
  const claimed = new Uint8Array(candidates.length);
  const picked: C[] = [];
  const minLegSq = minLegPc * minLegPc;
  let lastPos: Vec3 | undefined;

  for (const sample of samples) {
    const [sx, sy, sz] = sample;
    const radius = Math.hypot(sx, sy, sz);
    const corridor = corridorFrac * radius;
    const corridorSq = corridor * corridor;

    let bestIdx = -1;
    let bestMag = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      if (claimed[i]) continue;
      const c = candidates[i]!;
      const dx = c.posPc[0] - sx;
      const dy = c.posPc[1] - sy;
      const dz = c.posPc[2] - sz;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > corridorSq) continue;
      // Reject a candidate sitting within minLegPc of the previous pick: that
      // would be a near-cusp leg the camera whips through.
      if (lastPos !== undefined) {
        const lx = c.posPc[0] - lastPos[0];
        const ly = c.posPc[1] - lastPos[1];
        const lz = c.posPc[2] - lastPos[2];
        if (lx * lx + ly * ly + lz * lz < minLegSq) continue;
      }
      if (c.absMag < bestMag) {
        bestMag = c.absMag;
        bestIdx = i;
      }
    }

    if (bestIdx < 0) continue; // empty corridor — this sample contributes nothing
    claimed[bestIdx] = 1;
    const pick = candidates[bestIdx]!;
    picked.push(pick);
    lastPos = pick.posPc;
  }

  return picked;
}
