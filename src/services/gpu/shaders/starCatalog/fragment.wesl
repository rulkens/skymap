// starCatalog/fragment.wesl — additive soft-dot fragments for survey stars.
//
// Two entry points share the rim-zeroed Gaussian glow profile below:
//
//   fs        — the LEAF stream. Applies the hue-preserving soft-knee
//               ('starKnee', knee.wesl) per glow, at deposit time, and writes
//               premultiplied '(tint * a, a)' into the HDR accumulation. This
//               is the full-resolution point-star path; its output is unchanged
//               by the aggregate split.
//   fsLinear  — the AGGREGATE stream. Same glow profile, NO knee: it writes the
//               LINEAR premultiplied glow '(tint * I, I)' into the half-res
//               'star-aggregates' offscreen, storing the raw pre-knee scalar 'I'
//               in the ALPHA channel. The offscreen additive-sums both, so its
//               alpha holds the SUMMED scalar and its rgb the summed tinted
//               light; the 'star-upsample' composite then applies 'starKnee' to
//               that summed scalar (starAggregateUpsample/fragment.wesl). Moving
//               the knee to the summed field is the LOD-symmetry fix — a stack
//               of sub-knee aggregate quads now compresses like a concentrated
//               bright leaf does, instead of escaping compression entirely.
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
// star's colour. Under the shared per-channel tonemap (lib/tonemap.wesl -- all
// five curves component-wise, with a final per-channel clamp) a glow whose
// scalar runs far over the displayable range clips its channels one at a time,
// collapsing every hue toward white; the survey's real colour structure would
// die at the DISPLAY step. So the LEAF path ('fs') compresses the SCALAR with
// the soft knee BEFORE the tint multiply -- 'starKnee' in knee.wesl, which owns
// the curve and its derivation -- keeping the channel ratios (the hue) intact
// at any exposure. Compressing the shared scalar, not per-channel after the
// multiply, is what keeps 'tint' pristine (the red channel would otherwise
// saturate first and drift the ratios); scoping it to this pass, not the shared
// tonemap, keeps the galaxy + volume calibration untouched.
//
// ## The two-stream LOD symmetry
//
// The knee is CONCAVE, so where it is applied changes what an LOD swap looks
// like. In the SUB-knee regime it is ~linear, so a refined child and its share
// of the parent both deposit the same light -- an LOD swap is invisible there
// regardless. The break was in the SATURATED regime with a SINGLE stream: many
// sub-knee AGGREGATE quads, each escaping compression, summed additively to a
// region far brighter than the same region drawn as one concentrated leaf that
// DID cross the knee. Splitting the streams fixes it: aggregates draw LINEAR
// ('fsLinear') into the half-res offscreen and the composite applies 'starKnee'
// to their SUMMED field, so an aggregate-covered region now compresses exactly
// like a bright leaf does. The only residual is the genuine concavity across a
// cross-knee refine (sum of compressed children >= compress of the summed
// parent) -- an accepted seam wobble in already-bright cores.
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
import package::starCatalog::knee::starKnee;

// Rim value of the bare Gaussian: exp(-4), the profile's height at r = 1. We
// subtract it and rescale (below) so the dot fades to exactly 0 at the disc edge
// -- see the header. Mirrors K_GAUSS's shifted-profile derivation in vertex.wesl.
const EDGE: f32 = 0.0183156; // exp(-4)

// The rim-zeroed Gaussian glow scalar, shared by both entry points: the
// flux-derived peak 'intensity' spread by the profile and faded by the per-node
// 'opacity'. Opacity multiplies HERE, before any compression: it is a fade -- a
// fraction of the glow's light -- so a half-faded bright glow is a dimmed bright
// glow (compressed as such), NOT a compressed glow then re-dimmed. The returned
// 'I' is the HDR amplitude and may be far above 1. 'r2' is the squared
// distance-from-centre the caller already computed for the unit-disc discard, so
// this helper contains NO discard (each entry point keeps its own, matching the
// original single-entry shader exactly).
fn glowScalar(r2: f32, intensity: f32, opacity: f32) -> f32 {
  // Rim-zeroed Gaussian: (exp(-4 r2) - EDGE) / (1 - EDGE) reaches exactly 0 at
  // the rim (r2 = 1) so saturated peaks show no hard edge, while g(0) = 1.
  // K_GAUSS in vertex.wesl integrates THIS profile, keeping total flux conserved.
  let g = (exp(-r2 * 4.0) - EDGE) / (1.0 - EDGE);
  return intensity * g * opacity;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard outside the inscribed unit disc so the dot is round.
  if (r2 > 1.0) { discard; }
  let I = glowScalar(r2, in.intensity, in.opacity);
  // Hue-preserving soft-knee compression on the SCALAR, tint applied AFTER, so
  // the tint's channel ratios (the colour) survive any exposure instead of
  // clipping toward yellow-white in the shared per-channel tonemap. The curve
  // lives in knee.wesl, shared with the aggregate-upsample composite.
  let a = starKnee(I);
  return vec4<f32>(in.color * a, a);
}

// The AGGREGATE stream's LINEAR variant: same glow, NO knee. rgb is the
// premultiplied tinted light 'tint * I'; alpha is the RAW pre-knee scalar 'I'.
// The half-res 'star-aggregates' offscreen additive-sums both channels, so its
// alpha ends the frame holding the SUMMED scalar and its rgb the summed tinted
// light. The 'star-upsample' composite reads that back and applies 'starKnee'
// to the summed scalar -- so overlapping aggregate quads compress as one bright
// region, the LOD-symmetry fix. Storing the scalar in alpha (rather than reading
// it back off a channel) keeps the composite independent of the tint's
// normalization -- the blue O/B tint is NOT r = 1, so a channel proxy would be
// wrong.
@fragment
fn fsLinear(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let I = glowScalar(r2, in.intensity, in.opacity);
  return vec4<f32>(in.color * I, I);
}
