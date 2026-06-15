/**
 * Minimal HEALPix nested-scheme pixel indexing for the angular-density
 * re-weighting bias mode.
 *
 * ### Why a hand-rolled HEALPix instead of a dependency?
 *
 * HEALPix (Górski et al. 2005) is a sky-tessellation scheme that splits the
 * sphere into 12·N² equal-area pixels.  We only need ONE function from it —
 * `(RA, Dec) → pixel index` at a fixed resolution `nside = 32` — so pulling
 * in a 1+ MB npm package (e.g. `healpix-geometry`) for ~80 lines of math is
 * disproportionate.  If this file ever exceeds ~150 lines, bail and `npm
 * install healpix-geometry` instead — the existing public API is `healpixNest
 * (raDeg, decDeg, nside): number` and would still drop straight in.
 *
 * ### Algorithm
 *
 * The nested-scheme index is computed as:
 *   1. Convert (RA, Dec) → (theta, phi) where theta is colatitude in [0, π]
 *      and phi is longitude in [0, 2π).
 *   2. Decide whether the pixel lies in the equatorial belt (|cos θ| ≤ 2/3)
 *      or one of the two polar caps (|cos θ| > 2/3).  HEALPix uses a slightly
 *      different formula for each region because the equatorial belt is
 *      tessellated into rectangular cells along iso-latitude rings while the
 *      polar caps use diamond cells whose iso-latitude ring count grows with
 *      distance from the pole.
 *   3. Compute the (face, x, y) triple — face ∈ [0, 11], x, y ∈ [0, nside).
 *   4. Bit-interleave x and y to produce the nested-scheme local pixel index,
 *      then add `face * nside²` for the global index.
 *
 * Reference: Górski et al. 2005, ApJ, 622, 759 §4.1.  Algorithm transcribed
 * from healpy's `pixelfunc.lonlat_to_healpix` (BSD-licensed) and the original
 * `chealpix` C source.
 *
 * ### Numerical notes
 *
 * - We accept `raDeg` outside [0, 360) and `decDeg` outside [-90, 90] as long
 *   as the conversion to (theta, phi) lands in valid ranges after wrap.
 *   Callers in `computeAngularWeights` have already passed positions through
 *   `cartesianToRaDecZ`, which guarantees RA ∈ [0, 360) and Dec ∈ [-90, 90].
 * - `nside` must be a power of 2 in [1, 2^29] for the bit-interleave step to
 *   produce a meaningful nested index.  We don't check — the call site uses
 *   `nside = 32` only.
 */

const TWO_THIRDS = 2 / 3;
const PI = Math.PI;

/**
 * Bit-interleave `a` and `b` (each a non-negative integer < 2^16) into a
 * single 32-bit integer where the bits of `a` occupy the even positions
 * (bits 0, 2, 4, …) and the bits of `b` occupy the odd positions
 * (bits 1, 3, 5, …).
 *
 * Used by HEALPix's nested-scheme to lay out the (x, y) sub-pixel coordinate
 * within a face as a Z-order (Morton) curve — this is what makes nested
 * pixels recursively contained: the first 4 nested pixels at nside=2 each
 * fall inside a single nested pixel at nside=1.
 *
 * Standard "bit-spread" trick: shift each bit of the input into its target
 * position by repeated mask-and-shift operations.  For 16-bit inputs the
 * operation completes in 5 mask/shift steps using fixed magic constants.
 * (For nside ≤ 8192 we'd need only 4 steps; we keep the 16-bit version
 * for the full nside up to 2^16 = 65536, well beyond our needs.)
 */
function spreadBits(v: number): number {
  let x = v & 0xffff;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  return x >>> 0;
}

/**
 * Compute the HEALPix nested-scheme pixel index for a sky direction.
 *
 * @param raDeg  Right ascension in degrees, [0, 360).
 * @param decDeg Declination in degrees, [-90, +90].
 * @param nside  HEALPix resolution parameter (power of 2).  Total pixel
 *               count is `12 * nside^2`; at `nside = 32` that's 12 288
 *               pixels of ~1.83° on a side.
 * @returns      Integer pixel index in [0, 12·nside²).
 */
export function healpixNest(raDeg: number, decDeg: number, nside: number): number {
  // Convert to colatitude/longitude in radians.  HEALPix's reference frame
  // uses theta = 0 at the north pole, π at the south, and phi growing
  // counterclockwise from +x in the equatorial plane — same handedness as
  // our Cartesian (x = RA 0°, Dec 0°) convention.
  const theta = (90 - decDeg) * (PI / 180);
  let phi = raDeg * (PI / 180);
  // Normalise phi into [0, 2π).  Handles negative or > 2π RA gracefully —
  // the body of the algorithm assumes 0 ≤ phi < 2π and would otherwise
  // produce out-of-range face indices.
  phi = phi - 2 * PI * Math.floor(phi / (2 * PI));

  const z = Math.cos(theta);
  const za = Math.abs(z);
  // tt is phi normalised into [0, 4) — counts how many "quadrants" of the
  // equator we are in.  HEALPix uses tt directly to derive the face index.
  const tt = (phi * 2) / PI; // in [0, 4)

  let face: number;
  let ix: number;
  let iy: number;

  if (za <= TWO_THIRDS) {
    // ── Equatorial belt ───────────────────────────────────────────────────
    //
    // The four "equatorial" faces (4..7) tile the band |cos θ| ≤ 2/3 with
    // square cells in the (tt, z) coordinate system.  The discretisation:
    //   jp = floor(nside · (0.5 + tt - 0.75 · z))  — "rising" diagonal
    //   jm = floor(nside · (0.5 + tt + 0.75 · z))  — "falling" diagonal
    // give two integer indices that together pick out the cell.
    const temp1 = nside * (0.5 + tt);
    const temp2 = nside * (z * 0.75);
    const jp = Math.floor(temp1 - temp2); // rising diagonal index
    const jm = Math.floor(temp1 + temp2); // falling diagonal index

    // The face number depends on which "ring of faces" jp/jm fall into.
    // ifp / ifm select between faces 4 / 0 / 8 (and similarly 5 / 1 / 9 etc.)
    // depending on whether jp and jm are above or below the central row.
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    if (ifp === ifm) {
      // North or south equatorial belt (face 4..7 if ifp==0; 4..7 mod 4 if 4)
      face = (ifp | 4) & 7;
    } else if (ifp < ifm) {
      face = ifp; // North polar face index 0..3
    } else {
      face = ifm + 8; // South polar face index 8..11
    }
    ix = jm & (nside - 1);
    iy = nside - 1 - (jp & (nside - 1));
  } else {
    // ── Polar caps ────────────────────────────────────────────────────────
    //
    // Above |cos θ| = 2/3 the equal-area constraint forces the cells to be
    // diamond-shaped on iso-latitude rings whose count grows toward the pole.
    // We compute a "tp" (modulo-1 fractional position within the quadrant)
    // and "tmp" (radial position toward the pole) that together pick out the
    // diamond.
    const ntt = Math.min(3, Math.floor(tt));
    const tp = tt - ntt; // in [0, 1)
    const tmp = nside * Math.sqrt(3 * (1 - za));

    const jp = Math.floor(tp * tmp);
    const jm = Math.floor((1 - tp) * tmp);
    // Clamp jp/jm so they don't equal nside (the formula above can produce
    // exactly nside at the equator boundary za = 2/3, which would lift the
    // pixel onto a face that doesn't exist).
    const jpC = Math.min(nside - 1, jp);
    const jmC = Math.min(nside - 1, jm);

    if (z >= 0) {
      face = ntt; // Faces 0..3
      ix = nside - jmC - 1;
      iy = nside - jpC - 1;
    } else {
      face = ntt + 8; // Faces 8..11
      ix = jpC;
      iy = jmC;
    }
  }

  // Combine (face, ix, iy) into the nested index by bit-interleaving ix and
  // iy and adding the face's offset of `nside^2` pixels.
  const ipix = face * nside * nside + (spreadBits(ix) | (spreadBits(iy) << 1));
  return ipix >>> 0;
}
