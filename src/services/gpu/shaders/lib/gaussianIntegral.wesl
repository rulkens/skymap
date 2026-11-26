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
fn erfcPoly(value: f32) -> f32 {
  let polynomialArg = 1.0 / (1.0 + 0.3275911 * value);
  return polynomialArg * (0.254829592
    + polynomialArg * (-0.284496736
    + polynomialArg * (1.421413741
    + polynomialArg * (-1.453152027
    + polynomialArg * 1.061405429))));
}

// erfc over the whole real line. b is negative whenever the camera looks
// toward or through a blob — the common case here, not an edge case — so the
// reflection erfc(-x) = 2 - erfc(x) is load-bearing.
fn erfc(value: f32) -> f32 {
  if (value >= 0.0) {
    return erfcPoly(value) * exp(-value * value);
  }
  return 2.0 - erfcPoly(-value) * exp(-value * value);
}

// exp(-0.5*closestDistSq) * erfc(erfcArg), with the erfcArg >= 0 branch folding both exponents into
// ONE exp. Evaluated separately that branch is exp(+large) * exp(-large) for
// a blob far behind the camera: the first factor overflows to inf, the
// second flushes to 0, and inf * 0 is NaN — one NaN texel then poisons the
// whole bloom pyramid.
fn expHalfErfc(closestDistSq: f32, erfcArg: f32) -> f32 {
  if (erfcArg >= 0.0) {
    return erfcPoly(erfcArg) * exp(-0.5 * closestDistSq - erfcArg * erfcArg);
  }
  return exp(-0.5 * closestDistSq) * (2.0 - erfcPoly(-erfcArg) * exp(-erfcArg * erfcArg));
}

// gaussianRayCoeffs — the ray-quadratic's three coefficients (quadraticCoeff, linearCoeff, closestDistSq) for a
// general symmetric M, split as mDiag = (m00, m11, m22) and
// mOff = (m01, m02, m12). Split out of gaussianRayIntegral so the dust
// splat's finite-bound split (dustMap/fragment.wesl's and
// dustAttenuation.wesl's fs) can evaluate the SAME quadratic at a
// truncation point x1 rather than only x0's full-ray form.
// quadraticCoeff < 1e-12 (ray direction in M's null space) returns vec3(0.0); callers
// must check .x themselves before dividing by it, same discipline
// gaussianRayIntegral applies below.
fn gaussianRayCoeffs(origin: vec3<f32>, dir: vec3<f32>, mDiag: vec3<f32>, mOff: vec3<f32>) -> vec3<f32> {
  let quadraticCoeff = bilinearForm(dir, dir, mDiag, mOff);
  if (quadraticCoeff < 1e-12) { return vec3<f32>(0.0); }
  let linearCoeff = bilinearForm(origin, dir, mDiag, mOff);
  // closestDistSq, the closest approach in squared Mahalanobis distance, is evaluated AT
  // that closest point (origin - dir*linearCoeff/quadraticCoeff, where the ray's linearCoeff vanishes). Taken from origin as
  // c - linearCoeff*linearCoeff/quadraticCoeff it cancels whenever c >> closestDistSq (a compact shell far away: c ~ 4e8,
  // closestDistSq ~ 16), and the cut test against SPLAT_CUT^2 turns into rounding noise.
  // quadraticCoeff and linearCoeff stay on origin: callers read -linearCoeff/quadraticCoeff as a depth along THIS ray.
  let oNear = origin - dir * (linearCoeff / quadraticCoeff);
  let closestDistSq = max(bilinearForm(oNear, oNear, mDiag, mOff), 0.0);
  return vec3<f32>(quadraticCoeff, linearCoeff, closestDistSq);
}

// left^T M right for the symmetric M split as gaussianRayCoeffs takes it: each cross
// term is symmetrised, so left == right gives the quadratic form right^T M right.
fn bilinearForm(left: vec3<f32>, right: vec3<f32>, mDiag: vec3<f32>, mOff: vec3<f32>) -> f32 {
  return dot(left * right, mDiag)
    + dot(
      vec3<f32>(left.x * right.y + left.y * right.x, left.x * right.z + left.z * right.x, left.y * right.z + left.z * right.y),
      mOff,
    );
}

// gaussianRayIntegral — the full 0->infinity line integral, built on
// gaussianRayCoeffs. The amplitude A is left to the caller so a component
// can carry colour through the same multiply.
fn gaussianRayIntegral(origin: vec3<f32>, dir: vec3<f32>, mDiag: vec3<f32>, mOff: vec3<f32>) -> f32 {
  let coeffs = gaussianRayCoeffs(origin, dir, mDiag, mOff);
  let quadraticCoeff = coeffs.x;
  if (quadraticCoeff < 1e-12) { return 0.0; }
  return sqrt(GAUSS_PI / (2.0 * quadraticCoeff)) * expHalfErfc(coeffs.z, coeffs.y / sqrt(2.0 * quadraticCoeff));
}
