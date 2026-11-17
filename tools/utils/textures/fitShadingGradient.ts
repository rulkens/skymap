/**
 * fitShadingGradient — weighted least squares of one high-passed window's
 * luminance on its high-passed slopes (design §4). No intercept: a constant
 * offset is degenerate with albedo, which a photograph can never separate
 * from shading, so the model only ever explains the slope-correlated part.
 */

// A reference terrain slope variance (m/m)², below which a window has too
// little relief for its fit to be trusted regardless of R² — an unmodulated
// flat window can still spuriously align with noise. Set to (3% RMS)²: MOLA
// slopes at 650 m are mostly 1-3% RMS, so a 1% reference would gate out most
// of Mars.
const SLOPE_VARIANCE_REF = 0.001;

export function fitShadingGradient(
  y: Float32Array,
  sx: Float32Array,
  sy: Float32Array,
  weight: Float32Array,
): { gx: number; gy: number; confidence: number } {
  let sumW = 0;
  let sumWSx = 0;
  let sumWSy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sxz = 0;
  let syz = 0;
  let szz = 0;
  for (let i = 0; i < y.length; i++) {
    const w = weight[i]!;
    const x1 = sx[i]!;
    const x2 = sy[i]!;
    const z = y[i]!;
    sumW += w;
    sumWSx += w * x1;
    sumWSy += w * x2;
    sxx += w * x1 * x1;
    sxy += w * x1 * x2;
    syy += w * x2 * x2;
    sxz += w * x1 * z;
    syz += w * x2 * z;
    szz += w * z * z;
  }
  if (sumW <= 0) return { gx: 0, gy: 0, confidence: 0 };

  const det = sxx * syy - sxy * sxy;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12 * Math.max(sxx * syy, 1e-12)) {
    return { gx: 0, gy: 0, confidence: 0 };
  }
  const gx = (sxz * syy - syz * sxy) / det;
  const gy = (sxx * syz - sxy * sxz) / det;

  // Both R² and var(s) fall out of the same accumulated sums: the
  // no-intercept identity SS_res = SS_tot - (gx·Sxz + gy·Syz), and
  // Var_w(x) = E_w[x²] - E_w[x]².
  const r2 = szz > 0 ? Math.min(1, Math.max(0, (gx * sxz + gy * syz) / szz)) : 0;
  const meanSx = sumWSx / sumW;
  const meanSy = sumWSy / sumW;
  const varS =
    Math.max(0, sxx / sumW - meanSx * meanSx) + Math.max(0, syy / sumW - meanSy * meanSy);
  const confidence = Math.min(1, Math.max(0, r2 * Math.min(1, varS / SLOPE_VARIANCE_REF)));

  return { gx, gy, confidence };
}
