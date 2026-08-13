// zoneOfAvoidance/label/fragment.wesl — curved on-band lettering fragment
// stage. Single-band MSDF fill, no outline band: this is fixed astronomical
// furniture (one string, one colour), not user-configurable UI text, so it
// skips labels/fragment.wesl's two-band outline composite.
//
// Additive, like the band it annotates (not premultiplied OVER): both draw
// into the same pre-tone-map HDR target within one render pass, and OVER's
// dst-alpha read hit a documented Apple-Silicon coherency bug across
// pass.end/pass.begin boundaries when this target split (see passes/index.ts
// "OVER-blend coherency"). Additive sidesteps it — the lettering reads as
// part of the dust glow rather than crisp UI text, which fits its role.

import package::zoneOfAvoidance::label::io::Uniforms;
import package::zoneOfAvoidance::label::io::VsOut;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

// Median of three scalars — see labels/fragment.wesl's 'median3' for the
// MSDF rationale; duplicated here rather than imported because it is a
// two-line leaf with no other shared state to couple through.
fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let s = textureSample(atlas, atlasSampler, input.uv).rgb;
  let d = median3(s.r, s.g, s.b) - 0.5;
  let aa = fwidth(d);
  let alpha = smoothstep(-aa, aa, d) * u.fadeAlpha;
  if (alpha <= 0.0) {
    discard; // pure additive target — saves the blend, mirrors the band
  }
  return vec4<f32>(u.color * alpha, alpha);
}
