// starAggregateUpsample/vertex.wesl — fullscreen covering-triangle vertex
// stage. Identical to additiveUpsample/vertex.wesl: synthesise three vertices
// that cover the whole viewport with uv in [0,1]^2. The fragment samples the
// half-res 'star-aggregates' offscreen at 'in.uv' with a linear sampler, which
// gives the 2x bilinear upscale for free.

import package::starAggregateUpsample::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard 'big triangle' trick -- see compositor/vertex.wesl for the
  // why-not-a-quad rationale.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
