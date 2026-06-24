/**
 * buildNfwLensLut — precompute the inverse NFW lens equation over a (y, s)
 * grid and return it as a flat Float32Array.
 *
 * ## The dimensionless NFW lens equation
 *
 * For a circularly symmetric NFW halo, the single-lens deflection law in
 * scale-radius units is:
 *
 *   y = x − s · m(x)
 *
 * where:
 *   - y  = angular separation source↔lens in scale-radius units (dimensionless)
 *   - x  = signed angular separation image↔lens (positive = same side as source)
 *   - s  = reduced strength = θ_E_peak · (D_ls/D_s) · (D_l/r_s)
 *            (the single dial that controls whether we are in the weak-,
 *             strong-, or super-critical regime)
 *   - m(x) = g(x)/x, the Wright & Brainerd (2000) enclosed-mass shape,
 *            peak-normalised so that max m = 1 (see `nfwShape` below).
 *
 * We want x given (y, s) — that is the INVERSE of the above equation — which
 * has no closed form. This function samples the forward equation on a dense
 * x-grid, brackets sign changes of `lensYOf(x, s) − y_target`, bisects each
 * bracket, then classifies the roots into primary (outermost, positive-x)
 * and counter (brightest, negative-x) images.
 *
 * ## Why a 2D LUT instead of solving per-vertex on the GPU
 *
 * The root-finding requires ~50 bisection iterations per image per vertex,
 * plus a dense initial scan to locate brackets. For 2.5 M galaxies per frame
 * that is ~10^8 transcendental evaluations — completely intractable on the
 * vertex stage. A 256×64 f16 texture costs ~128 KB and reduces the
 * per-vertex work to a single texture lookup.
 *
 * ## Why this function is CPU-only
 *
 * This is a build-time / initialisation-time generator that fills a
 * Float32Array once. The GPU resource (Phase 3 of the lensing feature) packs
 * the f32 values into an f16 texture and uploads it. Keeping the generator
 * in pure TS makes it trivially testable without any WebGPU context.
 *
 * ## s-axis log scaling
 *
 * The interesting physics is heavily concentrated near s = 0 (weak lensing)
 * and near the caustic crossing (strong lensing onset). A linear s-axis would
 * waste most of its rows on the largely-empty strong-lensing tail. Instead
 * we use a log-like monotone map from row index j ∈ [0, height−1] to
 * s ∈ [0, sMax]:
 *
 *   FORWARD:  s(j) = sMax · (exp(LOG_K · j/(height−1)) − 1) / (exp(LOG_K) − 1)
 *
 * The algebraic inverse (for the GPU sampler to recover the row coordinate
 * from a query strength value s):
 *
 *   INVERSE:  j(s) = (height−1) · log(1 + s/sMax · (exp(LOG_K) − 1)) / LOG_K
 *
 * LOG_K = 4.0 puts ~50 % of the rows below s ≈ 0.13 · sMax, giving good
 * resolution in the weak-lensing regime while the log tail still reaches the
 * full caustic width by row height−1.
 *
 * ## Magnification
 *
 * For a circularly symmetric lens the magnification of an image at position x
 * for source y is:
 *
 *   |μ| = 1 / |(y/x) · (dy/dx)|
 *
 * where dy/dx = d(lensYOf)/dx = 1 − s · m'(|x|).
 * m'(|x|) is evaluated by central difference (cheap at build time).
 * The formula diverges as y → 0 (Einstein ring) or as dy/dx → 0 (critical
 * curve); both are handled by the MU_MAX clamp.
 *
 * ## Third and fourth images
 *
 * For large s (super-critical regime) and small y, both the positive-x and
 * negative-x halves of lensYOf can independently contribute two roots each,
 * giving four images total. The two-channel LUT budget (primary + counter)
 * holds only two. Any cell with roots.length > 2 drops the excess images:
 * the primary is always the outermost same-side root, the counter is the
 * brightest opposite-side root, and the rest are discarded. A one-time
 * console.warn per build makes this truncation auditable.
 */

import type { NfwLensLut } from '../../@types/lensing/NfwLensLut';

// Peak of g(x)/x for the Wright & Brainerd NFW enclosed-mass profile.
// This exact value is the source of truth mirrored in 'lib/lensing.wesl'
// as 'NFW_SHAPE_PEAK: f32 = 0.3122'. Exported so parity tests can assert
// the WESL mirror matches without a second literal.
export const NFW_SHAPE_PEAK = 0.3122;

// Log-curvature constant for the s-axis mapping. Higher LOG_K packs more
// rows near s = 0; LOG_K = 4 puts ~50 % of the rows below s ≈ 0.13 · sMax.
// The GPU sampler must use the same value in the algebraic inverse formula
// documented in the module header above. Exported as the single source of
// truth for the WESL mirror 'LENS_LUT_LOG_K' (lib/lensing.wesl), guarded by
// tests/services/gpu/shaders/nfwLutConstants.parity.test.ts.
export const LOG_K = 4.0;

// Hard cap on magnification. Exported as the source of truth mirrored in
// 'shaders/points/vertex.wesl' as 'LENS_MU_MAX: f32 = 10.0'. The LUT and
// the SIS path agree on the maximum brightness boost a lensed galaxy can
// receive; parity tests assert the WESL mirror matches this value.
export const MU_MAX = 10.0;

// How many x-samples to take in the initial root-bracketing scan. 2000 gives
// sub-0.005 unit spacing for a typical x-range of 10, narrow enough to
// reliably bracket all sign changes of the NFW shape (whose sharpest features
// live near x ≈ 0.01–1 in scale-radius units).
const N_SCAN = 2000;

// Central-difference step for nfwShape'. Large enough to avoid f64
// cancellation in the smooth region; small enough for the derivative to
// track the NFW shape faithfully.
const CD_H = 1e-5;

/**
 * Peak-normalised Wright & Brainerd (2000) NFW enclosed-mass shape
 * m(x) = g(x) / (x · NFW_SHAPE_PEAK), where:
 *
 *   g(x) = ln(x/2) + ⎧ arccosh(1/x)/√(1−x²)   (x < 1)
 *                    ⎨ 1                        (x = 1) → g(1) = 1 − ln 2
 *                    ⎩ arccos(1/x)/√(x²−1)     (x > 1)
 *
 * Dividing by NFW_SHAPE_PEAK makes the peak value exactly 1.0, so the
 * strength knob reads as the peak angular deflection in the same units as
 * the SIS Einstein radius — toggling SIS↔NFW keeps the ring roughly the
 * same size. This is a direct port of `lib/lensing.wesl:148-162`.
 *
 * Input is clamped to [1e-4, 1e4] to match the GPU implementation. Only
 * positive x makes physical sense (projected radius in scale-radius units);
 * callers pass |x|.
 */
function nfwShape(x: number): number {
  const xc = Math.max(1e-4, Math.min(1e4, x));
  let g: number;
  if (Math.abs(xc - 1.0) < 1e-3) {
    // Removable singularity at x=1: the limit g(1) = 1 − ln 2 can be derived
    // by L'Hôpital or by expanding the arccosh/sqrt terms to second order.
    g = 1.0 - 0.6931472; // 1 − ln 2
  } else if (xc < 1.0) {
    const s = Math.sqrt(1.0 - xc * xc);
    // arccosh(1/x) written as log((1 + √(1−x²)) / x) — avoids needing a
    // dedicated arccosh; WGSL only has log/acos/sqrt in its core set.
    g = Math.log(xc * 0.5) + Math.log((1.0 + s) / xc) / s;
  } else {
    const s = Math.sqrt(xc * xc - 1.0);
    g = Math.log(xc * 0.5) + Math.acos(1.0 / xc) / s;
  }
  return g / xc / NFW_SHAPE_PEAK;
}

/**
 * Derivative of nfwShape by central difference.
 * Used only in the magnification formula — evaluated once per root at build
 * time, so the four transcendental calls have negligible cost.
 */
function nfwShapePrime(x: number): number {
  return (nfwShape(x + CD_H) - nfwShape(x - CD_H)) / (2 * CD_H);
}

/**
 * Signed lens-equation forward map: given image position x return the source
 * position y that produces an image at x with reduced strength s.
 *
 * For x ≥ 0 (image on the same side as the source):
 *   y = x − s · m(x)
 *
 * For x < 0 (image on the opposite side — counter-image):
 *   y = x + s · m(|x|)
 *   [which equals −(|x| − s · m(|x|)) by the odd symmetry of the lens]
 */
function lensYOf(x: number, s: number): number {
  if (x >= 0) {
    return x - s * nfwShape(x);
  }
  return x + s * nfwShape(-x);
}

/**
 * Magnification of an image at position x for source y with reduced strength s.
 *
 *   |μ| = 1 / |(y/x) · (1 − s · m'(|x|))|
 *
 * Clamped to MU_MAX. Returns MU_MAX for degenerate cases (y = 0 produces an
 * Einstein ring, x ≈ 0 is unstable numerically, and dy/dx ≈ 0 is the
 * critical-curve divergence).
 */
function magnification(x: number, y: number, s: number): number {
  if (Math.abs(x) < 1e-9) return MU_MAX;
  const dydx = 1.0 - s * nfwShapePrime(Math.abs(x));
  const kappa = Math.abs((y / x) * dydx);
  if (kappa < 1e-9) return MU_MAX;
  return Math.min(1.0 / kappa, MU_MAX);
}

/**
 * Map row index j ∈ [0, height−1] to reduced strength s ∈ [0, sMax].
 * See the module-header for the forward and inverse formulas.
 */
function rowToS(j: number, height: number, sMax: number): number {
  if (height <= 1) return 0;
  const t = j / (height - 1);
  return sMax * (Math.exp(LOG_K * t) - 1) / (Math.exp(LOG_K) - 1);
}

// One-time third-image warning flag — reset at the top of each
// buildNfwLensLut call so tests and repeated builds each get at most one
// warning if the triple-root cell is encountered.
let _thirdImageWarned = false;

/**
 * Build a precomputed inverse-NFW-lens LUT.
 *
 * @param width   Number of columns = resolution along the y (source) axis.
 * @param height  Number of rows    = resolution along the s (strength) axis.
 * @param yMax    Maximum source position (dimensionless scale-radius units).
 *                y-axis spans [0, yMax] linearly.
 * @param sMax    Maximum reduced strength. s-axis spans [0, sMax] on a
 *                log-like curve controlled by LOG_K (see module header).
 *                A starting value of sMax = 3 covers the caustic for most
 *                clusters reachable in the skymap strength range; tune after
 *                visual smoke-testing in Part 2.
 *
 * @returns NfwLensLut with `width*height*4` f32 values in a Float32Array,
 *          row-major, y fastest:
 *            index = (rowS * width + colY) * 4 + channel
 *          channels: [xPrimary, muPrimary, xCounter, muCounter]
 */
export function buildNfwLensLut(
  width: number,
  height: number,
  yMax: number,
  sMax: number,
): NfwLensLut {
  _thirdImageWarned = false; // reset per-build

  const data = new Float32Array(width * height * 4);

  // x-scan bounds. Images can be displaced by at most s (the peak deflection),
  // so bracketing x ∈ [−xBound, +xBound] with xBound = yMax + sMax + 2
  // is conservative: the "+2" absorbs the NFW shape's long low-curvature tail.
  const xBound = yMax + sMax + 2.0;
  const xStep = (2 * xBound) / (N_SCAN - 1);

  for (let rowS = 0; rowS < height; rowS++) {
    const s = rowToS(rowS, height, sMax);

    for (let colY = 0; colY < width; colY++) {
      const y = (colY / Math.max(width - 1, 1)) * yMax;

      // --- Root finding ---
      // Scan f(x) = lensYOf(x, s) − y for sign changes, then bisect each
      // bracket to 40 iterations (error < xStep/2^40 ≈ negligible).
      const roots: number[] = [];

      let xPrev = -xBound;
      let fPrev = lensYOf(xPrev, s) - y;

      for (let i = 1; i < N_SCAN; i++) {
        const xCurr = -xBound + i * xStep;
        const fCurr = lensYOf(xCurr, s) - y;

        if (fPrev * fCurr < 0) {
          // Sign change — bisect the bracket [xPrev, xCurr].
          let lo = xPrev;
          let hi = xCurr;
          let fLo = fPrev;
          for (let k = 0; k < 40; k++) {
            const mid = 0.5 * (lo + hi);
            const fMid = lensYOf(mid, s) - y;
            if (fLo * fMid <= 0) {
              hi = mid;
            } else {
              lo = mid;
              fLo = fMid;
            }
          }
          roots.push(0.5 * (lo + hi));
        }

        xPrev = xCurr;
        fPrev = fCurr;
      }

      // --- Classify roots ---
      // y-axis spans [0, yMax] so y ≥ 0 always. Same-side images have x ≥ 0
      // (deflected away from the lens centre, on the same sky side as the
      // source). Counter-images have x < 0 (on the opposite side, forming the
      // Einstein ring arc).
      const sameSide: number[] = [];
      const oppSide: number[] = [];
      for (const x of roots) {
        if (x >= -1e-9) {
          sameSide.push(x);
        } else {
          oppSide.push(x);
        }
      }

      // --- Warn once when more than two roots are found (third image present) ---
      // The two-channel layout (primary + counter) can hold at most two images.
      // When a cell has more roots — e.g. 2 positive-x + 2 negative-x for small y
      // and large s — the additional roots are silently dropped. The warn makes
      // this truncation auditable without logging every cell.
      if (roots.length > 2 && !_thirdImageWarned) {
        _thirdImageWarned = true;
        console.warn(
          `buildNfwLensLut: ${roots.length} image roots at ` +
          `(y=${y.toFixed(4)}, s=${s.toFixed(4)}) — ` +
          `excess images dropped to fit the two-channel LUT budget.`,
        );
      }

      // --- Primary: outermost (largest |x|) same-side root ---
      let xPrimary = y; // identity fallback: no deflection when s≈0 or no root
      let muPrimary = 1.0;
      if (sameSide.length > 0) {
        sameSide.sort((a, b) => Math.abs(b) - Math.abs(a));
        xPrimary = sameSide[0]!;
        muPrimary = magnification(xPrimary, y, s);
      }

      // --- Counter: brightest opposite-side root (zero when absent) ---
      let xCounter = 0;
      let muCounter = 0;
      if (oppSide.length > 0) {
        let bestMu = -1;
        let bestX = 0;
        for (const x of oppSide) {
          const mu = magnification(x, y, s);
          if (mu > bestMu) {
            bestMu = mu;
            bestX = x;
          }
        }
        xCounter = bestX;
        muCounter = bestMu;
      }

      // --- Write cell ---
      const idx = (rowS * width + colY) * 4;
      data[idx + 0] = xPrimary;
      data[idx + 1] = muPrimary;
      data[idx + 2] = xCounter;
      data[idx + 3] = muCounter;
    }
  }

  return { width, height, yMax, sMax, data };
}
