// lib/gaussianIntegral.wesl — the closed-form line integral of an
// anisotropic Gaussian along a ray, plus the erfc WGSL does not provide.
//
// For nu(p) = A * exp(-0.5 * p^T M p) and p(t) = o + t*d with d normalised,
// a = d.M.d, b = o.M.d, c = o.M.o, the emission gathered from the eye to
// infinity is
//   A * sqrt(PI / (2a)) * exp(-0.5 * (c - b*b/a)) * erfc(b / sqrt(2a))
// One evaluation replaces a whole marched ray, which is the point: a
// mixture of these is a galaxy's smooth stellar field in closed form.
//
// Callers pass M as its own six independent entries in WORLD space, not a
// diagonal plus a rotation to apply here: the galactic warp shears a blob out
// of every axis-aligned frame, so no rotation of o and d can diagonalise it,
// and building the general form per ray would repeat CPU work per fragment.

const GAUSS_PI: f32 = 3.14159265;

// Abramowitz & Stegun 7.1.26, POSITIVE domain only: the polynomial factor
// P with erfc(x) = P(x) * exp(-x*x). Split out from erfc so callers that
// already hold another negative exponent can sum the two before exp'ing.
fn erfcPoly(x: f32) -> f32 {
  let t = 1.0 / (1.0 + 0.3275911 * x);
  return t * (0.254829592
    + t * (-0.284496736
    + t * (1.421413741
    + t * (-1.453152027
    + t * 1.061405429))));
}

// erfc over the whole real line. b is negative whenever the camera looks
// toward or through a blob — the common case here, not an edge case — so the
// reflection erfc(-x) = 2 - erfc(x) is load-bearing.
fn erfc(x: f32) -> f32 {
  if (x >= 0.0) {
    return erfcPoly(x) * exp(-x * x);
  }
  return 2.0 - erfcPoly(-x) * exp(-x * x);
}

// exp(-0.5*q) * erfc(x), with the x >= 0 branch folding both exponents into
// ONE exp. Evaluated separately that branch is exp(+large) * exp(-large) for
// a blob far behind the camera: the first factor overflows to inf, the
// second flushes to 0, and inf * 0 is NaN — one NaN texel then poisons the
// whole bloom pyramid.
fn expHalfErfc(q: f32, x: f32) -> f32 {
  if (x >= 0.0) {
    return erfcPoly(x) * exp(-0.5 * q - x * x);
  }
  return exp(-0.5 * q) * (2.0 - erfcPoly(-x) * exp(-x * x));
}

// gaussianRayCoeffs — the ray-quadratic's three coefficients (a, b, q) for a
// general symmetric M, split as mDiag = (m00, m11, m22) and
// mOff = (m01, m02, m12). Split out of gaussianRayIntegral so the dust
// splat's finite-bound split (dustMap/fragment.wesl's and
// dustAttenuation.wesl's fs) can evaluate the SAME quadratic at a
// truncation point x1 rather than only x0's full-ray form.
// a < 1e-12 (ray direction in M's null space) returns vec3(0.0); callers
// must check .x themselves before dividing by it, same discipline
// gaussianRayIntegral applies below.
fn gaussianRayCoeffs(o: vec3<f32>, d: vec3<f32>, mDiag: vec3<f32>, mOff: vec3<f32>) -> vec3<f32> {
  let a = bilinearForm(d, d, mDiag, mOff);
  if (a < 1e-12) { return vec3<f32>(0.0); }
  let b = bilinearForm(o, d, mDiag, mOff);
  // q, the closest approach in squared Mahalanobis distance, is the same from
  // any origin on the ray, so it is taken from the point nearest the centre
  // (d is unit). From o itself, c - b*b/a cancels: a compact HII shell 31 kpc
  // out has c ~ 4e8 and q ~ 16, and one f32 ulp of d swung q across SPLAT_CUT^2.
  // a and b stay on o, since callers read -b/a as a depth along THIS ray. The
  // clamp catches the residual rounding at grazing incidence.
  let oNear = o - d * dot(o, d);
  let bNear = bilinearForm(oNear, d, mDiag, mOff);
  let q = max(bilinearForm(oNear, oNear, mDiag, mOff) - bNear * bNear / a, 0.0);
  return vec3<f32>(a, b, q);
}

// u^T M v for the symmetric M split as gaussianRayCoeffs takes it: each cross
// term is symmetrised, so u == v gives the quadratic form v^T M v.
fn bilinearForm(u: vec3<f32>, v: vec3<f32>, mDiag: vec3<f32>, mOff: vec3<f32>) -> f32 {
  return dot(u * v, mDiag)
    + dot(
      vec3<f32>(u.x * v.y + u.y * v.x, u.x * v.z + u.z * v.x, u.y * v.z + u.z * v.y),
      mOff,
    );
}

// gaussianRayIntegral — the full 0->infinity line integral, built on
// gaussianRayCoeffs. The amplitude A is left to the caller so a component
// can carry colour through the same multiply.
fn gaussianRayIntegral(o: vec3<f32>, d: vec3<f32>, mDiag: vec3<f32>, mOff: vec3<f32>) -> f32 {
  let coeffs = gaussianRayCoeffs(o, d, mDiag, mOff);
  let a = coeffs.x;
  if (a < 1e-12) { return 0.0; }
  return sqrt(GAUSS_PI / (2.0 * a)) * expHalfErfc(coeffs.z, coeffs.y / sqrt(2.0 * a));
}
