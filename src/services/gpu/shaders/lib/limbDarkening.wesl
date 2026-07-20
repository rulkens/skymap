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
// ## The BASE_EPS floor (the NaN-night-side trap)
//
// The base is floored at BASE_EPS, not 0. A zero base is a live NaN mine:
// WGSL defines 'pow(x, y) = exp2(y * log2(x))', so 'pow(0.0, 0.0)' is
// '0 * -inf = NaN' — and 'mix(1.0, NaN, 0.0)' is '1*1 + NaN*0', which is STILL
// NaN (NaN times zero is NaN, so the strength-0 arm does NOT collapse to its
// first arg). Every night-side fragment ('mu0 == 0' after the caller's clamp) of
// every identity-packed body (strength 0, exponent 1) therefore rendered NaN —
// drawn as pure black, swallowing the ambient floor entirely and turning the
// terminator into a hard lit-to-NaN step. Flooring the base makes the exponent-0
// identity exact ('pow(BASE_EPS, 0.0) == 1.0'), and for real limb exponents the
// difference from a true zero base is invisible (pow(1e-6, 0.3) ~ 0.016, on a
// fragment Lambert has already zeroed).
//
// The 'max' also still guards the negative-base case (undefined for a
// fractional exponent) beyond the limb or on the night side.
//
// Single quotes in comments; no backticks (WESL parse rule).

const BASE_EPS: f32 = 1e-6;

fn limbDarkening(mu0: f32, mu: f32, strength: f32, exponent: f32) -> f32 {
  let darken = pow(max(mu0 * mu, BASE_EPS), exponent - 1.0);
  return mix(1.0, darken, strength);
}
