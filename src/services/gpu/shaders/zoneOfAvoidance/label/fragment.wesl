// zoneOfAvoidance/label/fragment.wesl — curved on-band lettering fragment
// stage. Single-band MSDF fill (no outline — fixed astronomical furniture,
// skips labels/fragment.wesl's outline band). Additive, not premultiplied
// OVER, though both draw into the same pre-tone-map HDR target: OVER's
// dst-alpha read hit a documented Apple-Silicon coherency bug across
// pass.end/pass.begin splits on this target (passes/index.ts's
// "OVER-blend coherency"); additive sidesteps it.

import package::zoneOfAvoidance::label::io::Uniforms;
import package::zoneOfAvoidance::label::io::VsOut;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

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
    discard;
  }
  return vec4<f32>(u.color * alpha, alpha);
}
