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
// ## Blend target
//
// PREMULTIPLIED output '(rgb * a, a)' into the depthless rgba16float HDR
// accumulation with one/one additive blending (configured pipeline-side in
// starCatalogRenderer.ts) — the survey-point convention, so overlapping
// stars brighten long-exposure style. The per-node 'opacity' (the source
// crossfade that hands off to the procedural Milky-Way cloud, times the node's
// octree-cut LOD fade) multiplies the Gaussian alpha, staying premultiplied.

import package::starCatalog::io::VSOut;

// Rim value of the bare Gaussian: exp(-4), the profile's height at r = 1. We
// subtract it and rescale (below) so the dot fades to exactly 0 at the disc edge
// -- see the header. Mirrors K_GAUSS's shifted-profile derivation in vertex.wesl.
const EDGE: f32 = 0.0183156; // exp(-4)

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard outside the inscribed unit disc so the dot is round.
  if (r2 > 1.0) { discard; }
  // Rim-zeroed Gaussian: (exp(-4 r2) - EDGE) / (1 - EDGE) reaches exactly 0 at
  // the rim (r2 = 1) so saturated peaks show no hard edge, while g(0) = 1.
  // K_GAUSS in vertex.wesl integrates THIS profile, keeping total flux conserved.
  let g = (exp(-r2 * 4.0) - EDGE) / (1.0 - EDGE);
  // Flux-derived peak * rim-zeroed falloff * per-node opacity (crossfade x LOD fade).
  // Premultiplied; 'intensity' is the HDR amplitude and may exceed 1.
  let a = in.intensity * g * in.opacity;
  return vec4<f32>(in.color * a, a);
}
