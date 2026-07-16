// starCatalog/fragment.wesl — additive soft-dot fragment for survey stars.
//
// The same Gaussian-falloff dot the survey galaxy points and the seeded
// scene stars use ('exp(-r2 * 4.0)' — bright centre, ~0.018 at the disc
// edge), so a Gaia bin star reads as the same species of glowing point as
// every other additive emitter. The circumscribing-triangle billboard puts
// the unit disc inside the triangle, so fragments past r = 1 fall outside
// the disc and are discarded.
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

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard outside the inscribed unit disc so the dot is round.
  if (r2 > 1.0) { discard; }
  // Flux-derived peak * Gaussian falloff * per-node opacity (crossfade x LOD fade).
  // Premultiplied; 'intensity' is the HDR amplitude and may exceed 1.
  let a = in.intensity * exp(-r2 * 4.0) * in.opacity;
  return vec4<f32>(in.color * a, a);
}
