// starCatalog/fragment.wesl — additive soft-dot fragment for survey stars.
//
// A soft additive dot like the survey galaxy points and seeded scene stars,
// but with a RIM-ZEROED Gaussian falloff. The bare 'exp(-r2 * 4.0)' still holds
// e^-4 ~= 1.83% of its peak at the disc edge (r = 1); on saturated peaks that
// residue reads as a hard-edged bright disc. We shift and rescale so the profile
// lands exactly on 0 at the rim while keeping the centre at 1:
//
//   g(r2) = (exp(-r2 * 4.0) - EDGE) / (1 - EDGE),   EDGE = e^-4
//
// The circumscribing-triangle billboard puts the unit disc inside the triangle,
// so fragments past r = 1 fall outside the disc and are discarded anyway; the
// rim-zero removes the residual edge just inside it. Flux stays conserved
// because K_GAUSS in vertex.wesl integrates THIS shifted profile (~0.7268), not
// the bare Gaussian -- the two files mirror EDGE and the profile shape.
//
// ## Flux-integrated peak
//
// Unlike the placeholder (uniform peak = 1 for every record, which let the
// dense field saturate additively to a uniform white), the peak here is the
// vertex stage's 'intensity' -- the flux-derived amplitude that makes the
// dot's INTEGRATED screen luminance proportional to the record's flux (see
// starCatalog/vertex.wesl). Faint stars now deposit almost nothing while
// bright stars deposit a lot (and bloom in the HDR pipeline), so the additive
// accumulation is dominated by the genuinely bright stars and reads as a
// structured, tinted glow rather than a clipped white wash. 'intensity' can
// exceed 1 -- that is intended: it is the HDR amplitude the tone-map + bloom
// downstream compress.
//
// ## Hue-preserving intensity compression (the whole point of this pass's math)
//
// Each glow paints 'tint * scalar', where the tint's channel RATIOS carry the
// star's colour (blue-white halo aggregates near BP-RP 0.7, reddened disc
// plane 1.8-2.3). Every tint anchor has r = 1.0 (tint.wesl), so under the
// shared per-channel tonemap (lib/tonemap.wesl -- all five curves are
// component-wise, with a final per-channel clamp) a glow whose scalar is far
// over the displayable range clips red first, then green, collapsing every
// hue toward yellow-white. At the eye-tuned exposures the survey's peaks sit
// well into that regime, so the real colour structure -- faithful in the data
// -- dies at the DISPLAY step.
//
// The fix is to compress the SCALAR intensity with a soft rolloff BEFORE the
// tint multiply, so the channel ratios (i.e. the hue) survive any exposure:
//
//   compress(I) = KNEE * (1 - exp(-I / KNEE))
//
// Linear for I << KNEE (compress(I) ~= I): the faint regime is untouched, so
// photometric invariance and flux conservation hold EXACTLY there -- which is
// exactly where an LOD swap must stay invisible (a just-refined child and its
// share of the parent are both sub-knee and both linear, so the swap deposits
// the same light). As I grows the output saturates smoothly toward the
// asymptote KNEE instead of clipping, so a bright CORE whitens the honest way
// -- by ACCUMULATION of many compressed, still-tinted glows summing past white
// in the additive target -- not by per-channel clipping of a single glow.
//
// WHY on the scalar, before the tint: compressing per-channel AFTER the
// multiply (compress(tint*I) componentwise) is just a softer version of the
// same hue collapse -- the red channel, starting highest, saturates first and
// the ratios still drift. Only compressing the shared scalar keeps 'tint'
// pristine.
//
// WHY here and not the shared tonemap: the tonemap serves galaxies and volumes
// too, which have their own calibrated look; this compression is scoped to the
// star layer that needs it, applied per-glow at deposit time.
//
// The trade: exact flux LINEARITY is given up in the SATURATED regime -- once
// either a parent aggregate or its children cross the knee, the children can
// sum slightly brighter than the compressed parent (compress is concave, so
// sum of compressed children >= compress of summed parent). That LOD-seam
// brightness wobble in already-bright cores is the accepted cost; the
// alternative was hue collapse across the entire bright field.
//
// KNEE sits comfortably above 1.0 so bloom still sees genuine HDR values and
// bright cores still bloom, yet well below the old unbounded peaks so the
// rolloff actually engages where the colour was dying.
//
// ## Blend target
//
// PREMULTIPLIED output '(rgb * a, a)' into the depthless rgba16float HDR
// accumulation with one/one additive blending (configured pipeline-side in
// starCatalogRenderer.ts) — the survey-point convention, so overlapping
// stars brighten long-exposure style. The per-node 'opacity' (the source
// crossfade that hands off to the procedural Milky-Way cloud, times the node's
// octree-cut LOD fade) scales the raw scalar BEFORE compression (below).

import package::starCatalog::io::VSOut;

// Rim value of the bare Gaussian: exp(-4), the profile's height at r = 1. We
// subtract it and rescale (below) so the dot fades to exactly 0 at the disc edge
// -- see the header. Mirrors K_GAUSS's shifted-profile derivation in vertex.wesl.
const EDGE: f32 = 0.0183156; // exp(-4)

// Soft-knee for the hue-preserving scalar compression (header). The asymptote
// the compressed scalar saturates toward, and the scale of the linear->
// saturating transition: I << KNEE is ~linear (faint regime exact), I >> KNEE
// flattens toward KNEE. 8.0 -- above 1.0 (bright cores still exceed display
// range and bloom) yet far below the old unbounded peaks (the rolloff engages
// where hue was collapsing). Eye-tunable via HMR.
const KNEE: f32 = 8.0;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard outside the inscribed unit disc so the dot is round.
  if (r2 > 1.0) { discard; }
  // Rim-zeroed Gaussian: (exp(-4 r2) - EDGE) / (1 - EDGE) reaches exactly 0 at
  // the rim (r2 = 1) so saturated peaks show no hard edge, while g(0) = 1.
  // K_GAUSS in vertex.wesl integrates THIS profile, keeping total flux conserved.
  let g = (exp(-r2 * 4.0) - EDGE) / (1.0 - EDGE);
  // Raw per-pixel scalar: flux-derived peak * rim-zeroed falloff, faded by the
  // per-node 'opacity'. Opacity multiplies HERE, before compression: it is a
  // fade -- a fraction of the glow's light -- so a half-faded bright glow is a
  // dimmed bright glow (still compressed as such), NOT a compressed glow then
  // re-dimmed. 'I' is the HDR amplitude and may be far above 1.
  let I = in.intensity * g * in.opacity;
  // Hue-preserving soft-knee compression on the SCALAR, tint applied AFTER, so
  // the tint's channel ratios (the colour) survive any exposure instead of
  // clipping toward yellow-white in the shared per-channel tonemap (header).
  let a = KNEE * (1.0 - exp(-I / KNEE));
  return vec4<f32>(in.color * a, a);
}
