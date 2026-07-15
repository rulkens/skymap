// starCatalog/fragment.wesl — additive soft-dot fragment for survey stars.
//
// The same Gaussian-falloff dot the survey galaxy points and the seeded
// scene stars use ('exp(-r2 * 4.0)' — bright centre, ~0.018 at the disc
// edge), so a Gaia bin star reads as the same species of glowing point as
// every other additive emitter. The circumscribing-triangle billboard puts
// the unit disc inside the triangle, so fragments past r = 1 fall outside
// the disc and are discarded.
//
// ## Blend target
//
// PREMULTIPLIED output '(rgb * a, a)' into the depthless rgba16float HDR
// accumulation with one/one additive blending (configured pipeline-side in
// starCatalogRenderer.ts) — the survey-point convention, so overlapping
// stars brighten long-exposure style. The source crossfade 'opacity'
// (Task 11's band that hands off to the procedural Milky-Way cloud)
// multiplies the Gaussian alpha, staying premultiplied.

import package::starCatalog::io::VSOut;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard outside the inscribed unit disc so the dot is round.
  if (r2 > 1.0) { discard; }
  // Gaussian-like falloff, then the source crossfade alpha. Premultiplied.
  let a = exp(-r2 * 4.0) * in.opacity;
  return vec4<f32>(in.color * a, a);
}
