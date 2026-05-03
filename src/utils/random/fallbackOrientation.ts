/**
 * Deterministic pseudo-random orientation for galaxies that have no
 * real axis-ratio / position-angle measurement (after every cross-match
 * source has been exhausted).
 *
 * Why deterministic? Reload stability — the user pins a galaxy, refreshes
 * the page, and expects to see it tilted the same way. A fresh
 * `Math.random()` per session would re-roll on every load and look broken.
 *
 * Why a hash of (objID, ra, dec) and not just objID? Many of our records
 * have objID = 0n (2MRS, GLADE rows that weren't cross-matched to SDSS).
 * Without RA/Dec contribution every such row would seed the same way and
 * end up with identical orientation — a visible artifact of "every 2MRS
 * galaxy looks alike". Mixing in RA × 1e5 + Dec × 1e5 (positions are
 * unique to ~0.04 arcsec, well below the SDSS pixel scale) breaks the tie.
 *
 * Why mulberry32? It's the project's blessed seedable PRNG — the same
 * one used elsewhere for synthetic data — so the fallback's distribution
 * is statistically vetted and consistent with the rest of the codebase.
 *
 * Distribution:
 *   - axisRatio uniform in [0.3, 1.0): the lower bound matches the
 *     thinnest edge-on disks in real catalogues (b/a ≈ 0.1–0.2 is
 *     possible but rare; clipping to 0.3 keeps fallback rows from
 *     looking suspiciously elongated).
 *   - positionAngleDeg uniform in [0, 180): full range; PA wraps mod 180.
 */

import { mulberry32 } from './mulberry32';

/** Fold a bigint and two doubles into a single 32-bit seed. */
function hashSeed(objID: bigint, ra: number, dec: number): number {
  const idLow = Number(objID & 0xffffffffn);
  const raMix = Math.imul(Math.round(ra * 1e5) | 0, 0x9e3779b1);
  const decMix = Math.imul(Math.round(dec * 1e5) | 0, 0x85ebca77);
  let h = idLow ^ raMix ^ decMix;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Deterministic fallback orientation for a galaxy with no measured
 * axisRatio / positionAngleDeg.
 *
 * @param objID  Catalogue ID; pass `0n` for 2MRS/GLADE rows that lack one.
 * @param ra     Right ascension in degrees.
 * @param dec    Declination in degrees.
 * @returns      `{ axisRatio in [0.3, 1.0), positionAngleDeg in [0, 180) }`
 */
export function fallbackOrientation(
  objID: bigint,
  ra: number,
  dec: number,
): { axisRatio: number; positionAngleDeg: number } {
  const rng = mulberry32(hashSeed(objID, ra, dec));
  const axisRatio = 0.3 + rng() * 0.7; // [0.3, 1.0)
  const positionAngleDeg = rng() * 180; // [0, 180)
  return { axisRatio, positionAngleDeg };
}
