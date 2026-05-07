// lib/astro.wesl — astronomical magnitude conversions.
//
// What lives here: pure scalar math that turns the catalog's
// astronomy-flavoured numbers into the kinds of values a renderer
// actually wants to reason about. One function today; likely a
// handful more as the renderer grows (k-corrections, extinction,
// surface-brightness fall-off, mag→flux for additive blending, …).
// It gets its own module because 'astro' is the domain-meaningful
// name a future reader greps for — separating it from 'lib/math'
// makes 'where do magnitudes get converted?' a one-step search.
//
// ── why magnitudes are logarithmic ───────────────────────────────────
//
// The human eye is roughly log-sensitive: a star that looks 'twice as
// bright' as another is actually emitting many times more light.
// Hipparchus catalogued the naked-eye stars on a 1-to-6 step scale in
// the 2nd century BCE; the brightest were '1st magnitude', the
// faintest just-visible ones '6th magnitude'. Pogson formalised the
// scale in 1856 by defining 5 magnitudes = a flux ratio of exactly
// 100, which lined up well with the historical eyeball scale and
// preserved Hipparchus' integers. The relation:
//
//     m1 - m2 = -2.5 · log10(F1 / F2)
//
// (smaller m means brighter, because Hipparchus' '1st mag' stars
// were the brightest).
//
// ── why distance modulus exists ──────────────────────────────────────
//
// Apparent magnitude 'm' is what we measure on Earth — it folds in
// both the source's intrinsic luminosity AND its distance. To compare
// two galaxies fairly we want the distance-independent quantity:
// 'absolute magnitude' M, defined as the apparent magnitude the
// source would have if it sat at exactly 10 parsecs. The relation:
//
//     M = m - 5 · log10(d / 10pc)
//
// For d in megaparsecs, 'd / 10pc = d_Mpc · 1e5', and 5·log10(1e5)
// = 25, so the convenient form is:
//
//     M = m - 5 · log10(d_Mpc) - 25
//
// Mirror of 'absoluteFromApparent' in src/utils/math/distanceModulus.ts.
//
// WGSL has no native 'log10' intrinsic — only the natural log — so
// we divide log(x) by ln(10). The constant lives in lib/math as
// 'LOG10' so every consumer agrees on the same digits.

import package::lib::math::LOG10;

// distanceModulus(appMag, distMpc): apparent magnitude → absolute
// magnitude for a source at 'distMpc' megaparsecs from the observer.
// Used by the volume-limited Malmquist gate in points.wesl: galaxies
// whose absolute magnitude exceeds a user-set threshold get culled
// to keep the visible sample volume-complete instead of magnitude-
// limited.

fn distanceModulus(appMag: f32, distMpc: f32) -> f32 {
  return appMag - 5.0 * (log(distMpc) / LOG10) - 25.0;
}
