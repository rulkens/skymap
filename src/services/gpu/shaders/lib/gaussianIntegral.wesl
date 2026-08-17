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
  // v^T M v = dot(v*v, mDiag) + 2*dot((vx*vy, vx*vz, vy*vz), mOff), and the
  // mixed form u^T M v symmetrises each cross term.
  let a = dot(d * d, mDiag) + 2.0 * dot(vec3<f32>(d.x * d.y, d.x * d.z, d.y * d.z), mOff);
  if (a < 1e-12) { return vec3<f32>(0.0); }
  let b = dot(o * d, mDiag)
    + dot(
      vec3<f32>(o.x * d.y + o.y * d.x, o.x * d.z + o.z * d.x, o.y * d.z + o.z * d.y),
      mOff,
    );
  let c = dot(o * o, mDiag) + 2.0 * dot(vec3<f32>(o.x * o.y, o.x * o.z, o.y * o.z), mOff);
  // The quadratic's minimum along the ray, i.e. the closest approach in
  // Mahalanobis distance. Analytically non-negative; clamped because
  // cancellation between c and b*b/a can put it a hair under zero at grazing
  // incidence, and a negative q turns the exp into a blowup.
  let q = max(c - b * b / a, 0.0);
  return vec3<f32>(a, b, q);
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
