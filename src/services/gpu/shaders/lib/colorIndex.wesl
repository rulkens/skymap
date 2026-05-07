// lib/colorIndex.wesl — colour-index → RGB mapping shared across renderers.
//
// What lives here: the piecewise 'ramp(t)' that maps an SDSS-style g−r
// colour index to an RGB tint. The same mapping is used by the points
// pass (instanced billboards) and the procedural-disk pass (close-up
// galaxy impostor) so that a galaxy's tint is identical at every LOD —
// any drift between the two would show up as a colour pop the moment
// the disk impostor fades in over the point billboard.
//
// Why a dedicated file rather than folding 'ramp' into 'lib/math.wesl'?
// 'lib/math.wesl' is for context-free numeric primitives (saturate,
// rot2, sabs, polar conversions) — things any renderer might want.
// The colour ramp encodes a domain-specific decision: "this is how
// skymap converts catalogue colour-index to display RGB". That's a
// rendering-policy choice, not a math primitive. Splitting it into its
// own file keeps the import sites self-documenting ('colorIndex::ramp'
// reads as "the colour-index ramp", not "some math helper") and gives
// us a natural home for future colour-related helpers (e.g. an
// ln(L_K)→tint mapping for the procedural-disk bulge if we ever want
// hue to track luminosity).
//
// Why not inline copies in each shader? That's where this code started
// (see the deleted 'Mirror of points.wgsl ramp(t)' comment in
// proceduralDisks.wesl history). Two copies of the same anchor colours
// are an editing trap: a tweak to one without the other silently
// produces visible cross-LOD colour drift. Centralising eliminates the
// hazard.
//
// ── the ramp ─────────────────────────────────────────────────────────
//
// Maps SDSS g−r colour index 't' to an RGB tint. Piecewise:
//
//   t ≤ 0      → blueWhite blend, parameter clamped at 0
//                (fully blue: hot quasars / O/B stars)
//   0 < t ≤ 1  → blueWhite blend, parameter in (0, 0.5]
//   1 < t ≤ 2  → whiteRed blend, parameter in (0.5, 1]
//   t > 2      → fully red (M-type stars, red galaxies)
//
// Both blends share the same 's = saturate(t * 0.5)' parameter so the
// transition is continuous and uses the same 0→1 interpolation range
// in each half. Anchor colours:
//
//   blue  = (0.4, 0.6, 1.0)   — hot blue
//   white = (1.0, 0.95, 0.8)  — warm white (shared join point)
//   red   = (1.0, 0.5, 0.3)   — cool red
//
// WGSL 'select(a, b, cond)' note: returns 'a' when cond is FALSE, 'b'
// when cond is TRUE — the reverse of the C-style ternary 'cond ? b : a'
// argument order. So 'select(blueWhite, whiteRed, t > 1.0)' returns
// blueWhite for t ≤ 1 and whiteRed for t > 1. Easy to invert; worth
// the comment.

import package::lib::math::saturate;

fn ramp(t: f32) -> vec3<f32> {
  // s goes 0→1 as t goes 0→2; saturate stops it at 0 for negatives and 1 for t>2.
  let s = saturate(t * 0.5);

  // Blue-to-white: hot blue (quasars, O/B stars) fading to a warm white.
  let blueWhite = mix(vec3<f32>(0.4, 0.6, 1.0), vec3<f32>(1.0, 0.95, 0.8), s);

  // White-to-red: warm white fading to cool red (M-type stars, red galaxies).
  let whiteRed  = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.5, 0.3), s);

  // Pick the right half of the ramp: blue-white for t ≤ 1, white-red for t > 1.
  // Remember: select(falseVal, trueVal, condition).
  return select(blueWhite, whiteRed, t > 1.0);
}
