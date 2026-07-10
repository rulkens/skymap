// starPoints/fragment.wesl — additive soft-dot fragment for scene stars.
//
// Same Gaussian-falloff dot the survey points use ('exp(-r2 * 4.0)' —
// bright centre, ~0.018 at the billboard edge), so a scene star and a
// catalogue galaxy read as the same species of glowing point. Unlike
// 'points/colorFragment.wesl' there is no elliptical mask, no fade
// uniform and no bias machinery: a star is round and always on.
//
// ## VSOut duplication
//
// The VSOut struct is re-declared here rather than shared through an
// io.wesl because the interface is two interpolants and is consumed by
// exactly one fragment module — an io.wesl earns its keep only when one
// vertex stage feeds two or more fragment stages, as points/ does.
//
// ## Blend target
//
// PREMULTIPLIED output, '(rgb * alpha, alpha)', into the depthless
// rgba16float HDR accumulation with one/one additive blending
// (configured pipeline-side in starPointRenderer.ts) — byte-for-byte
// the same convention as the survey points, so overlapping stars
// brighten long-exposure style.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
};

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard the billboard's corners so the dot is round.
  if (r2 > 1.0) { discard; }
  // Gaussian-like falloff, matching the survey-point dot profile.
  let alpha = exp(-r2 * 4.0);
  return vec4<f32>(in.color * alpha, alpha);
}
