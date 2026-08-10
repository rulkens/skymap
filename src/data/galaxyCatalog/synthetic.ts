/**
 * Synthetic point cloud generator.
 *
 * Before real SDSS data is piped through the loader, we need something to
 * render so the GPU pipeline can be built and debugged in isolation. This
 * module generates 100k fictitious galaxies distributed uniformly inside a
 * sphere of radius 1000 Mpc — roughly the depth of the SDSS main galaxy
 * sample — with plausible 5-band photometry.
 *
 * Two design decisions worth knowing:
 *
 *   1. DETERMINISTIC PRNG — we use a seeded pseudo-random number generator
 *      (mulberry32) rather than `Math.random()`. `Math.random()` re-seeds
 *      itself from OS entropy each page load, so the cloud would change every
 *      time you refresh, making visual regressions impossible to reproduce.
 *      A fixed seed means the same 100k points appear on every reload, in
 *      every browser, forever — handy for debugging and screenshotting.
 *
 *   2. REJECTION SAMPLING for uniform-in-sphere positions. Distributing
 *      points correctly inside a 3-D ball is subtler than it looks; see the
 *      `generateSyntheticCloud` docs below.
 *
 * The synthetic `objIDs` are sequential (0, 1, 2, …). Real SDSS objIDs are
 * 19-digit numbers encoding tile/run/field/object; sequential 0..N−1 is fine
 * here since the synthetic dataset won't match any real SDSS object. Image
 * cutouts (if the renderer tries them) are RA/Dec-based, not objID-based, so
 * the cutout URL still works for synthetic data.
 */

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import { mulberry32 } from '../../utils/random/mulberry32';
import { uniformInSphere } from '../../utils/random/uniformInSphere';
import { galaxyMedianAbsMag } from '../../utils/galaxy/galaxyMedianAbsMag';

// ─── Cloud generator ─────────────────────────────────────────────────────────

/**
 * Generate a synthetic `GalaxyCatalog` of `count` fictitious galaxies distributed
 * uniformly inside a sphere of radius 1000 Mpc.
 *
 * ---
 * ### Why rejection sampling?
 *
 * A beginner's first instinct is to draw a random direction on the unit sphere
 * and scale it by a random radius:
 *
 *     r = rand()^(1/3) * radius   // so density ∝ r² cancels the volume element
 *     point = unitVector * r
 *
 * That formula *does* give uniform-in-sphere points but requires a cube-root
 * and a unit-vector normalisation (which itself needs a square root and a
 * guard against division by zero).
 *
 * An even simpler mistake is just `rand() * radius` — that over-populates the
 * centre because the volume of a thin shell grows as r², so the PDF of r alone
 * should be ∝ r², not uniform.
 *
 * Rejection sampling avoids both problems with only arithmetic:
 *
 *  1. Draw (x, y, z) uniformly in the cube [−1, +1]³.
 *  2. If the point lands *outside* the unit sphere (x²+y²+z² > 1), discard it
 *     and try again.
 *  3. Scale the accepted point by `radius`.
 *
 * Because the cube is the same box regardless of sphere radius, every accepted
 * point is uniformly distributed inside the unit ball by construction — no
 * transcendental functions needed.
 *
 * **Acceptance rate**: the volume of the unit sphere is (4/3)π ≈ 4.189, while
 * the enclosing cube has volume 2³ = 8. The ratio is π/6 ≈ 52.4 %, so roughly
 * 1 in 2 cube samples is accepted. That means we draw ≈ 1.91 × count random
 * triples on average — acceptable for a one-time initialisation.
 *
 * ---
 * ### Five-band photometry ranges
 *
 * The band-difference ranges below are not random noise — they reflect typical
 * observed galaxy colors in the SDSS photometric system:
 *
 * - `magG` ∈ [14, 22]: the g-band is the primary brightness proxy.
 *     14 ≈ brightest main-sample galaxy (roughly L* at z ≈ 0.01),
 *     22 ≈ faint limit of the SDSS spectroscopic galaxy catalog.
 *
 * - `u − g` ∈ [0.5, 2.5]: blue star-forming galaxies cluster around 0.8–1.2;
 *     red quiescent ellipticals around 1.6–2.2. Our range [0.5, 2.5] spans
 *     both populations with a little headroom.
 *
 * - `g − r` ∈ [0.3, 1.3]: r is typically brighter than g (lower magnitude
 *     number). Star-forming galaxies sit at the blue end (≈0.3–0.5); red
 *     sequence at the red end (≈0.6–0.9).
 *
 * - `r − i` ∈ [0.0, 0.6]: i-band is close to r-band in brightness;
 *     smaller differences than the bluer bands.
 *
 * - `i − z` ∈ [0.0, 0.4]: the two reddest bands are nearly equal for most
 *     galaxies; range tapers further.
 *
 * @param count  Number of points to generate. 100_000 is the default for the
 *               stand-in cloud; reduce during development if you need faster
 *               page loads.
 * @param seed   Integer seed for the mulberry32 PRNG. Changing this gives a
 *               different (but equally deterministic) cloud layout.
 */
export function generateSyntheticCloud(count: number, seed = 42): GalaxyCatalog {
  const rand = mulberry32(seed);

  // Allocate all typed arrays up front. Typed arrays are cheap to allocate
  // but expensive to grow, so size them exactly once rather than push()-ing.
  const objIDs = new BigUint64Array(count); // sequential IDs 0..N−1
  const positions = new Float32Array(count * 3); // (x, y, z) per point, Mpc
  const magG = new Float32Array(count); // g-band, ~[14, 22]
  const magU = new Float32Array(count); // u-band, ~[14.5, 24]
  const magR = new Float32Array(count); // r-band, ~[12.7, 21.7]
  const magI = new Float32Array(count); // i-band
  const magZ = new Float32Array(count); // z-band

  // Sphere radius in Mpc. 1000 Mpc corresponds to a redshift of roughly
  // z ≈ 0.23 under Hubble's law (c·z/H₀, H₀=70), which is well inside the
  // SDSS main galaxy sample depth.
  const radius = 1000; // Mpc

  for (let i = 0; i < count; i++) {
    // ── Sequential objID ──────────────────────────────────────────────────
    // BigInt(i) is fine for synthetic data: real SDSS objIDs are 19-digit
    // numbers, but sequential 0..N−1 keeps the field populated without
    // requiring a real catalog. Image URLs based on these IDs won't resolve.
    objIDs[i] = BigInt(i);

    // ── Rejection-sample a uniform-in-sphere position ──────────────────────
    // `uniformInSphere` returns a point in the unit ball; scale it to the
    // desired physical radius here.
    const [ux, uy, uz] = uniformInSphere(rand);
    positions[i * 3 + 0] = ux * radius;
    positions[i * 3 + 1] = uy * radius;
    positions[i * 3 + 2] = uz * radius;

    // ── Five-band photometry ───────────────────────────────────────────────
    // We generate the bands via sequential color differences so the simulated
    // galaxies span realistic parts of the SDSS color-color diagrams. See the
    // jsdoc above for the rationale behind each range.

    // g-band: the primary brightness proxy. Range [14, 22).
    const g = 14 + rand() * 8;
    magG[i] = g;

    // u-band: u − g ∈ [0.5, 2.5), so u = g + 0.5 + rand*2.0.
    magU[i] = g + 0.5 + rand() * 2.0;

    // r-band: g − r ∈ [0.3, 1.3), so r = g − 0.3 − rand*1.0.
    // r is numerically *smaller* (brighter) than g for most galaxies.
    const r = g - 0.3 - rand() * 1.0;
    magR[i] = r;

    // i-band: r − i ∈ [0.0, 0.6), so i = r − rand*0.6.
    const iMag = r - rand() * 0.6;
    magI[i] = iMag;

    // z-band: i − z ∈ [0.0, 0.4), so z = i − rand*0.4.
    magZ[i] = iMag - rand() * 0.4;
  }

  // Orientation: synthetic clouds ship constant b/a=1 (perfect circle)
  // and PA=0.  The shader's elliptical-mask path is NOT NaN-safe for
  // positionAngleDeg — `cos(NaN)` / `sin(NaN)` propagate through the
  // fragment's rotation + r² test, the `r2 > 1.0` discard silently
  // skips (all NaN comparisons return false in IEEE 754), and the
  // billboard rasterises as a black square instead of a soft disk.
  // Real catalogs avoid this because the offline pipeline fills
  // missing PA via `fallbackOrientation`; synthetic is the only source
  // generated at runtime and so must emit finite sentinels itself.
  //
  // Choosing 1.0 / 0 (rather than `fallbackOrientation(objID, ra, dec)`)
  // matches the original intent — "no measurement, render as a round
  // point" — without introducing variable orientations that would
  // change every frame's pixel layout and undermine the deterministic-
  // PRNG promise above.
  const axisRatio = new Float32Array(count).fill(1.0);
  const positionAngleDeg = new Float32Array(count).fill(0);

  // Diameter: synthetic galaxies have no real photometric measurement, so
  // we fill with the project-wide DEFAULT_GALAXY_DIAMETER_KPC = 30. We do
  // NOT NaN-fill here (unlike axisRatio) because the renderer divides by
  // diameterKpc every frame to compute apparent angular size — a NaN would
  // propagate through the apparent-size math and black out every billboard.
  // 30 kpc is a plausible L* galaxy diameter and matches the same fallback
  // the build pipeline applies when a real catalog record has no size measurement.
  const diameterKpc = new Float32Array(count).fill(30);

  const cloud: GalaxyCatalog = {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
    // Synthetic galaxies have no AGN class and no Milliquas parent
    // galaxy catalog; both bytes stay 0 (`Uint8Array` default-fills with 0).
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
    // Orientation above is the constant round-point sentinel (b/a=1, PA=0),
    // not the deterministic hash fallback, so every row is flagged 0 ("not
    // fallback"). Uint8Array default-fills with 0.
    orientationIsFallback: new Uint8Array(count),
    // Diameter above is a procedurally generated 30-kpc value, treated as a
    // real (non-fallback) size like the orientation sentinel, so every row is
    // flagged 0. Uint8Array default-fills with 0.
    diameterIsFallback: new Uint8Array(count),
    // Synthetic galaxies have no photometric mass estimate; NaN is the
    // "no estimate" sentinel (0 would mean 1 M☉ and set the estimated bit).
    log10StellarMass: new Float32Array(count).fill(NaN),
  };
  cloud.medianAbsMag = galaxyMedianAbsMag(cloud);
  return cloud;
}
