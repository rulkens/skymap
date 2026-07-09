/**
 * makeEllipsoidUnionFilter — build a soft, sculpted membership predicate from a
 * smooth union of ellipsoids with a probabilistically-feathered surface.
 *
 * ## Why not a hard box?
 *
 * The obvious way to carve one named structure out of an all-sky catalog is a
 * hard RA × Dec × redshift box (`makeRaDecZBoxFilter`): six comparisons, a row
 * is either in or out. That is exactly right when the goal is "clip this
 * rectangular volume" — but it is the WRONG shape when the goal is to expose the
 * *form* of a lumpy structure. A box keeps the interstitial voids between the
 * structure's clumps, keeps the sparse corners, and draws a hard rectangular
 * rind that reads as a rendering artifact rather than as the object.
 *
 * This factory instead approximates the structure as a smooth UNION of a few
 * ellipsoids placed on the structure's density peaks, then thins galaxies out
 * with a feathered probability as they cross the union's surface. The result is
 * a lumpy ribbon that fuses the peaks into one body, dissolves its edges into
 * haze instead of a hard boundary, and drops the voids and corners the box would
 * have kept — so the underlying multi-clump structure shows through.
 *
 * ## The math (per row)
 *
 *   1. (ra, dec, z) → Cartesian Mpc (`raDecZToCartesian`).
 *   2. Evaluate each ellipsoid's signed-distance field (iq's polynomial
 *      approximation: negative inside, ~0 on the surface, positive outside).
 *   3. Fold them with Quilez's polynomial smooth-min so nearby ellipsoids merge
 *      into one blended body over a `blendMpc` band rather than intersecting in
 *      a crease.
 *   4. Map the union field `f` through a `smoothstep` over ±`falloffMpc` into a
 *      keep-probability: 1 deep inside (`f ≤ -falloff`), 0 outside
 *      (`f ≥ +falloff`), a smooth ramp across the 2·falloff-wide feather band
 *      straddling the surface.
 *   5. Accept with a DETERMINISTIC per-row hash: reload-stable (same galaxy,
 *      same verdict every session) and — crucially — self-dithering, so the
 *      feather band becomes a probabilistic haze rather than every row snapping
 *      to a threshold. The hash reuses the position-mix idiom from
 *      `fallbackOrientation`, extended with a redshift term so two galaxies in
 *      the same sky direction but at different depths hash independently.
 *
 * A galaxy far from every ellipsoid gets a large positive `f` → probability 0 →
 * rejected, so the whole all-sky catalog can be streamed through with no
 * separate bounding box: the high-redshift tracers that sit nowhere near the
 * ellipsoids simply drop out.
 *
 * No RA-wraparound handling — the structures this is used for sit mid-sky, well
 * clear of the 0°/360° seam, same stance as `makeDecBandFilter`.
 */

import type { Vec3 } from '../../../src/@types/math/Vec3';
import { raDecZToCartesian } from '../../../src/utils/math/raDecZToCartesian';
import { smoothstep } from '../../../src/utils/math/smoothstep';
import { mulberry32 } from '../../../src/utils/random/mulberry32';

/** One ellipsoid of the union: a centre and per-axis radii, both in Mpc. */
type Ellipsoid = { center: Vec3; radii: Vec3 };

/**
 * iq's polynomial ellipsoid signed-distance approximation. `p` is the query
 * point relative to the ellipsoid centre; `r` its per-axis radii. Negative
 * inside, ~0 on the surface, positive outside — an approximation (a true
 * ellipsoid SDF has no closed form) but smooth and cheap, which is all the
 * smooth-min union and the feather need. At the exact centre `k1` is 0; we
 * return the shortest semi-axis as the interior distance rather than dividing
 * by zero.
 */
function ellipsoidSdf(px: number, py: number, pz: number, r: Vec3): number {
  const [rx, ry, rz] = r;
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/**
 * Quilez's polynomial smooth-min: blends two distance fields over a `k`-wide
 * band so two ellipsoids fuse into one body with a rounded seam rather than
 * meeting in a hard crease. `k → 0` recovers the plain `min` (a sharp
 * intersection).
 */
function smin(a: number, b: number, k: number): number {
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

export function makeEllipsoidUnionFilter(
  ellipsoids: readonly Ellipsoid[],
  opts: { blendMpc: number; falloffMpc: number; seed: number },
): (raDeg: number, decDeg: number, z: number) => boolean {
  const { blendMpc, falloffMpc, seed } = opts;
  // Fold the seed once so it perturbs the acceptance hash: two filters built
  // with the same seed thin the feather identically, different seeds differently.
  const seedMix = Math.imul(seed | 0, 0x9e3779b1);

  return (raDeg: number, decDeg: number, z: number): boolean => {
    const [px, py, pz] = raDecZToCartesian(raDeg, decDeg, z);

    // Smooth union over the ellipsoids: fold left with the smooth-min so the
    // whole set merges into one blended field rather than a hard boolean OR.
    let f = ellipsoidSdf(
      px - ellipsoids[0]!.center[0],
      py - ellipsoids[0]!.center[1],
      pz - ellipsoids[0]!.center[2],
      ellipsoids[0]!.radii,
    );
    for (let i = 1; i < ellipsoids.length; i++) {
      const e = ellipsoids[i]!;
      const sd = ellipsoidSdf(
        px - e.center[0],
        py - e.center[1],
        pz - e.center[2],
        e.radii,
      );
      f = smin(f, sd, blendMpc);
    }

    // Feather the surface: 1 deep inside, 0 outside, a smooth ramp across the
    // 2·falloff band. `f ≤ -falloff` → smoothstep 0 → prob 1; `f ≥ +falloff` →
    // smoothstep 1 → prob 0.
    const keepProb = 1 - smoothstep(-falloffMpc, falloffMpc, f);

    // Deterministic per-row accept. The hash mixes RA, Dec, AND redshift (so
    // fore/background galaxies in the same sky direction dither independently),
    // reusing `fallbackOrientation`'s Math.imul avalanche rather than a fresh
    // hand-rolled mixer.
    const raMix = Math.imul(Math.round(raDeg * 1e5) | 0, 0x9e3779b1);
    const decMix = Math.imul(Math.round(decDeg * 1e5) | 0, 0x85ebca77);
    const zMix = Math.imul(Math.round(z * 1e5) | 0, 0xc2b2ae35);
    let h = raMix ^ decMix ^ zMix ^ seedMix;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    const rng = mulberry32((h ^ (h >>> 16)) >>> 0);

    return rng() < keepProb;
  };
}
