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
// The blue-white half is parameterised by 'saturate(t)' over t in
// [0, 1]; the white-red half by 'saturate(t - 1)' over t in [1, 2].
// Each half therefore spans its own full 0→1 interpolation range, and
// both reach the shared white anchor exactly at t = 1, which is what
// makes the ramp continuous there. Anchor colours:
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
//
// Continuity at the join is load-bearing, not cosmetic: 'rampRadial'
// sweeps a single galaxy's argument across a range of 't' as the
// fragment radius varies, so any step at t = 1 would paint a
// hard-edged ring inside one galaxy, right where the core-to-rim
// gradient happens to straddle the join. A ramp sampled once per
// galaxy (the plain 'ramp(t)' call) can hide a step in a single flat
// colour; a ramp swept per fragment cannot.
//
// ── warm-core / cool-rim gradient ────────────────────────────────────
//
// This is the 'future colour-related helper' the module header above
// anticipates: a real galaxy isn't one flat colour end to end — the
// bulge is old, red, metal-rich stars, while the spiral arms carry
// young, blue O/B stars still lit by recent star formation. 'rampRadial'
// gives the two passes that draw a galaxy (points, procedural-disk) a
// single shared function of catalogued colour index 't' and normalised
// galactocentric radius 'r' (0 at the core, 1 at the rim), so the
// gradient is expressed the SAME way 'ramp' itself is expressed: as a
// shift in colour-INDEX space, not as an ad-hoc RGB tint layered on
// top. The alternative — nudging RGB channels directly at the core or
// rim — was tried and reverted (see the procedural-disk fragment
// shader's header) precisely because an RGB tint doesn't respect the
// ramp's shape: it can shift an intrinsically red elliptical toward
// blue at the rim, which is physically backwards. Shifting the ramp's
// INPUT instead guarantees a red galaxy just gets a *redder* core and
// a *less-red* rim — it never crosses into a hue the galaxy's
// catalogued colour index doesn't support.
//
// 'rampRadial's argument runs from 't + 0.1' at the core (redder,
// old-star bulge) down to 't - 0.1' at the rim (bluer, young-star
// arms) — i.e. 't + DISK_TINT_SPREAD * (0.5 - r)'. Why a SINGLE lookup
// rather than two endpoint lookups mixed together (the alternative
// form, 'mix(rampCore(t), rampRim(t), r)'): 'ramp' is piecewise LINEAR
// in its saturated parameter 's', so mixing two lookups that land on
// the same linear segment is exactly equal to one lookup at the mixed
// argument — 'mix(ramp(t+d), ramp(t-d), r) == ramp(t + d - 2*d*r)'.
// Collapsing the two calls into one halves the per-fragment ramp cost.
// Evaluating the ramp once, at the already radius-shifted argument,
// also means no pass needs to precompute and forward an endpoint
// delta to its fragment stage — which is what keeps the points pass
// within its existing varying budget instead of carrying a dedicated
// interpolator slot for it (see 'points/io.wesl').
//
// The one place this identity is inexact: 'ramp' switches segments at
// 't = 1' (see the piecewise description above), so for a galaxy whose
// catalogued colour index sits within 'DISK_TINT_SPREAD * 0.5' of 1.0,
// the shifted argument can cross that seam partway across the disk
// while the two-lookup form would have blended linearly across it
// instead. This is not a defect to route around: the one-lookup form
// is the BETTER-behaved of the two here, because it moves continuously
// along the ramp's own shape rather than linearly interpolating across
// a join between two different linear segments — a mix across the seam
// is the less physically-motivated of the two, not the more accurate
// one. So the single-lookup formulation is a straightforward
// improvement, not a compromise traded for fewer varyings.
//
// Why 0.2 ('DISK_TINT_SPREAD'): the constant lives in RAMP-POSITION
// units, not magnitudes. 'src/data/galaxyCatalog/colourIndex.ts' linearly
// remaps each source's own raw colour onto this 0..2 ramp via
// '((raw - rangeMin) / (rangeMax - rangeMin)) * 2', so one magnitude of
// real colour is worth '2 / (rangeMax - rangeMin)' ramp units — and
// that factor is PER SOURCE (different bands, different dynamic range).
//
// The centre-to-edge colour gradient this is meant to reproduce is
// measured, bluer outward, from three independent lines of evidence:
//   - ~20,000 face-on SDSS-DR4 spirals give a mean disk gradient of
//     -0.006 mag/kpc in g−r; over a ~15 kpc disk radius that's about
//     0.09 mag.
//   - SDSS early-type galaxies give d(g−r)/d log r of about -0.11 to
//     -0.16 mag per dex; the visible disk spans roughly one dex, so
//     about 0.11 to 0.16 mag.
//   - Bulge-versus-disc component colours differ by about 0.23 mag in
//     g−r (bulge 0.91, disc 0.68), with large scatter.
// Taking ~0.15 mag as the centre-to-edge figure and converting through
// the per-source factors currently in play (2MRS 5.00, the three DESI
// sources 2.86, SDSS and Famous 1.33, Milliquas 1.00, GLADE 0.67 ramp
// units per magnitude): 0.15 mag at the median factor (1.33) gives 0.2.
//
// This is a known simplification, not an exact-per-source result:
// because a single ramp-space constant is shared by every source while
// the conversion factor is per-source, the effective physical gradient
// this produces differs between catalogs — roughly 0.04 mag for 2MRS
// up to 0.30 mag for GLADE. Making this exact would mean deriving the
// spread per source from its own 'colourSpec' range and its own band's
// measured gradient, which is a larger change than this constant.
//
// The split is symmetric around the catalogued colour index (±0.1,
// i.e. ±DISK_TINT_SPREAD * 0.5) rather than skewed toward one endpoint,
// so the galaxy's INTEGRATED hue — what you'd get averaging core and
// rim — stays close to its catalogued colour value; the gradient adds
// internal structure without changing the galaxy's overall colour
// identity.
//
// 'ramp' saturates its input at both ends (t ≤ 0 is fully blue, t > 2
// is fully red — see the piecewise description above), so for a
// colour index already near either extreme, the core-shifted and
// rim-shifted arguments converge to the same clamped colour and the
// gradient visibly flattens out. That's intended, not a bug: a t=0
// quasar has no redder-bulge structure to reveal, so there's nothing
// physical for the gradient to express, and self-limiting at the
// ramp's clamps keeps the shifted argument from ever producing an
// out-of-range tint.

import package::lib::math::saturate;

fn ramp(t: f32) -> vec3<f32> {
  // Blue-to-white: hot blue (quasars, O/B stars) fading to a warm white,
  // over its own t in [0, 1].
  let blueWhite = mix(vec3<f32>(0.4, 0.6, 1.0), vec3<f32>(1.0, 0.95, 0.8), saturate(t));

  // White-to-red: warm white fading to cool red (M-type stars, red galaxies),
  // over its own t in [1, 2].
  let whiteRed  = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.5, 0.3), saturate(t - 1.0));

  // Pick the right half of the ramp: blue-white for t ≤ 1, white-red for t > 1.
  // Remember: select(falseVal, trueVal, condition).
  return select(blueWhite, whiteRed, t > 1.0);
}

// Total core-to-rim spread in colour-index units — see the header
// section above ('warm-core / cool-rim gradient') for why 0.2 and why
// the shift below is symmetric around 't' rather than one-sided.
const DISK_TINT_SPREAD = 0.2;

// Warm-core / cool-rim galaxy tint, collapsed to one ramp lookup.
// 't' is the galaxy's catalogued (rest-frame, K-corrected) colour
// index; 'r' is the normalised galactocentric radius in the galaxy's
// own plane, 0 at the core and 1 at the rim. At r=0 the argument is
// 't + DISK_TINT_SPREAD * 0.5' (redder, matching the old-star bulge);
// at r=1 it's 't - DISK_TINT_SPREAD * 0.5' (bluer, matching the
// young-star spiral arms); values in between move linearly along the
// ramp's own argument rather than blending two separately-looked-up
// colours. See the header section above for the algebraic identity
// this rests on and the one place it's inexact.
fn rampRadial(t: f32, r: f32) -> vec3<f32> {
  return ramp(t + DISK_TINT_SPREAD * (0.5 - r));
}
