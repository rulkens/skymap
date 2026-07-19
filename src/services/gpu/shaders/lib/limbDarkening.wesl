// lib/limbDarkening.wesl — the Minnaert limb-darkening factor, expressed
// RELATIVE to the Lambert term the caller already applies.
//
// A real planetary disc is not uniformly bright: it dims toward the limb (the
// edge) because we see the surface at a grazing angle, and — for many bodies —
// brightens or dims toward the sub-solar point differently than a pure Lambert
// (cosine) law predicts. The Minnaert law captures both with a single exponent
// 'k':
//
//   I/F = mu0^k * mu^(k-1)
//
// where 'mu0 = dot(N, L)' (cosine of the incidence angle, sun to normal) and
// 'mu = dot(N, V)' (cosine of the emission angle, normal to viewer).
//
// ## Why this returns a FACTOR, not the whole shade term
//
// The textured-body fragment already multiplies by the Lambert term 'mu0'
// (via 'litShade' in 'lib/bodyLighting.wesl'). Minnaert factors cleanly over
// that existing cosine:
//
//   mu0^k * mu^(k-1) = mu0 * (mu0 * mu)^(k-1)
//
// so the piece the caller has NOT already applied is exactly '(mu0 * mu)^(k-1)'.
// Returning that composable factor lets the fragment keep its Lambert path and
// just multiply this in — no rederivation of the base cosine.
//
// ## Identity conditions (why the absent-row data-gate is safe)
//
// 'strength == 0' returns 1.0 exactly (the 'mix' collapses to its first arg), so
// a body with no Minnaert row packed shades identically to plain Lambert. The
// exponent 'k == 1' is ALSO the identity: '(mu0 * mu)^0 == 1'. Either one makes
// this a no-op, which is why Task 4 can gate the effect entirely on data —
// bodies without a param row pack strength 0 and render exactly as before.
//
// 'max(mu0 * mu, 0.0)' guards 'pow' against a negative base (undefined for a
// fractional exponent): on the night side or beyond the limb one cosine is
// negative, and Lambert has already zeroed those fragments anyway.
//
// Single quotes in comments; no backticks (WESL parse rule).

fn limbDarkening(mu0: f32, mu: f32, strength: f32, exponent: f32) -> f32 {
  let darken = pow(max(mu0 * mu, 0.0), exponent - 1.0);
  return mix(1.0, darken, strength);
}
