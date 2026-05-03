/**
 * pointInfoBuilder — pure helpers for turning raw cloud arrays into a
 * `PointInfo` value the React layer can render.
 *
 * Three things live here:
 *
 *   - `buildPointInfo(cloud, idx)` — the only place in the engine that knows
 *     how to turn a (cloud, index) pair into a fully-derived `PointInfo`.
 *     Concentrating the data → display path in one function makes the trig
 *     and physics math easy to trace and unit-test.
 *   - `maxAbsCoord(cloud)` — bounding-box heuristic used at startup to frame
 *     the camera around whichever cloud loaded.
 *   - `niceRound(x)` — axis-ticker style "round down to {1,2,5}×10^k" used by
 *     the scale-bar legend.
 *
 * All three functions are pure (no mutation, no I/O) which makes them easy
 * to test in isolation and means they don't need engine state threaded in.
 */

import type { PointCloud, PointInfo } from '../../@types';
import { Source, sourceLabel } from '../../data/sources';
import {
  cartesianToRaDecZ,
  formatRaSexagesimal,
  formatDecSexagesimal,
  iauName,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyTypeFromColor,
  sdssExplorerUrl,
  sdssThumbnailUrl,
  dssThumbnailUrl,
} from '../../utils/math';

/**
 * Return the maximum absolute value of any coordinate component in the cloud's
 * positions array.
 *
 * We use *max abs of any component* rather than computing a true bounding
 * radius (which would require a sqrt per point). For camera-distance purposes
 * this is a heuristic — slightly over-estimating is harmless — and avoiding
 * sqrt keeps this O(N) scan as cheap as possible.
 *
 * The result is used to auto-frame the camera so any cloud (real SDSS or
 * synthetic sphere) is comfortably visible regardless of its spatial extent.
 */
export function maxAbsCoord(cloud: PointCloud): number {
  let m = 0;
  for (let i = 0; i < cloud.positions.length; i++) {
    const v = Math.abs(cloud.positions[i]!);
    if (v > m) m = v;
  }
  return m;
}

/**
 * Round `x` down to the nearest "nice" number from the {1, 2, 5} × 10^k family.
 *
 * This is the same rounding scheme used by axis tickers in plotting libraries
 * (matplotlib's MaxNLocator, d3's ticks(), etc.). Given any positive real, it
 * returns the largest "round" value ≤ x where round means the mantissa is one
 * of 1, 2, or 5. Examples:
 *
 *     niceRound(  3.7) →   2     (3.7 → mantissa 3.7 → rounds down to 2)
 *     niceRound( 47)   →  20     (47 → 4.7 × 10¹ → 2 × 10¹)
 *     niceRound(800)   → 500     (800 → 8 × 10² → 5 × 10²)
 *     niceRound(  0.07)→   0.05  (0.07 → 7 × 10⁻² → 5 × 10⁻²)
 *
 * Why floor (not nearest)? For a scale bar we want the *bar to fit inside* the
 * desired pixel target, never overflow it. Rounding down to the nice value
 * below the target guarantees the rendered bar is ≤ targetPx.
 */
export function niceRound(x: number): number {
  if (x <= 0) return 0;
  const exp = Math.floor(Math.log10(x));
  const power = Math.pow(10, exp);
  const mantissa = x / power; // ∈ [1, 10)
  const niceMantissa = mantissa >= 5 ? 5 : mantissa >= 2 ? 2 : 1;
  return niceMantissa * power;
}

/**
 * Build a `PointInfo` value from raw cloud arrays for the given index.
 *
 * This is the only place in the engine that touches `cartesianToRaDecZ` and
 * the physics helpers — the React components receive the computed result and
 * never import data modules directly.  The computation is intentionally
 * concentrated here so the data→display path is easy to trace and test.
 *
 * The function is called at most once per hover/select event (not per frame),
 * so the modest cost of the trig + physics math is not on the hot path.
 *
 * The `source` parameter is required because the picker resolves a global
 * instance ID into a (source, localIdx) pair *before* calling us — the cloud
 * itself doesn't carry its own source tag (every point in a cloud shares it,
 * so storing it per-point would be wasteful).  We pipe it through here so we
 * can decide which thumbnail service to use and whether an SDSS Explorer
 * link makes sense.
 */
export function buildPointInfo(cloud: PointCloud, idx: number, source: Source): PointInfo {
  const px = cloud.positions[idx * 3 + 0]!;
  const py = cloud.positions[idx * 3 + 1]!;
  const pz = cloud.positions[idx * 3 + 2]!;

  // Recover sky coordinates from the Cartesian position stored in the cloud.
  // cartesianToRaDecZ inverts the Hubble-law conversion used at import time.
  const [ra, dec, redshift] = cartesianToRaDecZ(px, py, pz);

  // Euclidean distance in Mpc — same as the comoving distance under Hubble's law.
  const distanceMpc = Math.sqrt(px * px + py * py + pz * pz);

  // Pull all five photometric bands.  The `!` non-null assertions are safe here
  // because all mag arrays are guaranteed to have `count` elements (enforced by
  // the decoder and generator), and idx is always a valid pick result in [0, count).
  const magU = cloud.magU[idx]!;
  const magG = cloud.magG[idx]!;
  const magR = cloud.magR[idx]!;
  const magI = cloud.magI[idx]!;
  const magZ = cloud.magZ[idx]!;

  // u−r colour index is the standard SDSS discriminator for the red-sequence /
  // blue-cloud bimodality (Strateva et al. 2001). We pass it to galaxyTypeFromColor
  // rather than the u−g we feed the shader — u−r gives a cleaner separation.
  const uMinusR = magU - magR;

  // ── Per-source link / thumbnail wiring ─────────────────────────────────────
  //
  // SDSS galaxies get the proper SDSS DR18 ImgCutout (sharper, deeper, and the
  // same data the SDSS Explorer page itself uses).  Everything else (2MRS,
  // GLADE, Synthetic) falls back to the all-sky DSS service so we never
  // request blank frames from regions SDSS didn't observe.
  //
  // explorerUrl is intentionally null for non-SDSS rows: 2MRS and GLADE have
  // no equivalent per-object catalogue page, so a disabled UI affordance is
  // more honest than a link that 404s.  We also guard the SDSS branch on
  // objIDs[idx] > 0n because synthetic-style sequential IDs (0, 1, 2…) won't
  // resolve either.
  const isSdss = source === Source.SDSS;
  const objID = cloud.objIDs[idx]!;
  const explorerUrl = isSdss && objID > 0n ? sdssExplorerUrl(objID) : null;
  const thumbnailUrl = isSdss ? sdssThumbnailUrl(ra, dec, 200) : dssThumbnailUrl(ra, dec, 2);

  return {
    index: idx,
    objID: cloud.objIDs[idx]!,

    // World-space coordinates — copied so the React layer can pass them
    // straight into engine.focusOn() without redoing the trig.
    x: px,
    y: py,
    z: pz,

    // Sky coordinates — both decimal and pre-formatted sexagesimal strings.
    ra,
    dec,
    raSexagesimal: formatRaSexagesimal(ra),
    decSexagesimal: formatDecSexagesimal(dec),

    // Cosmology derived from the recovered redshift and distance.
    redshift,
    distanceMpc,
    hubbleVelocityKmS: hubbleVelocityKmS(redshift),
    lookbackGyr: lookbackTimeGyr(redshift),
    earthEra: earthEraForLookback(lookbackTimeGyr(redshift)),

    // Five-band photometry — raw values, let the UI format them.
    magU,
    magG,
    magR,
    magI,
    magZ,

    // Derived quantities.
    absoluteMagG: absoluteMagnitude(magG, distanceMpc),
    galaxyType: galaxyTypeFromColor(uMinusR),
    iauName: iauName(source, ra, dec),

    // Source attribution — fed through to the InfoCard's badge + link logic.
    source,
    sourceLabel: sourceLabel(source),

    // External URLs — null/SDSS-vs-DSS chosen above based on `source`.
    explorerUrl,
    thumbnailUrl,
  };
}
