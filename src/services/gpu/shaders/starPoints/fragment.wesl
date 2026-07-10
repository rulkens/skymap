// starPoints/fragment.wesl — additive soft-dot fragment for scene stars.
//
// Same Gaussian-falloff dot the survey points use ('exp(-r2 * 4.0)' —
// bright centre, ~0.018 at the billboard edge), so a scene star and a
// catalogue galaxy read as the same species of glowing point. Unlike
// 'points/colorFragment.wesl' there is no elliptical mask, no fade
// uniform and no bias machinery: a star is round and always on.
//
// ## Blend target
//
// PREMULTIPLIED output, '(rgb * alpha, alpha)', into the depthless
// rgba16float HDR accumulation with one/one additive blending
// (configured pipeline-side in starPointRenderer.ts) — byte-for-byte
// the same convention as the survey points, so overlapping stars
// brighten long-exposure style.

import package::starPoints::io::VSOut;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  // Discard the billboard's corners so the dot is round.
  if (r2 > 1.0) { discard; }
  // Gaussian-like falloff, matching the survey-point dot profile.
  let alpha = exp(-r2 * 4.0);
  return vec4<f32>(in.color * alpha, alpha);
}
