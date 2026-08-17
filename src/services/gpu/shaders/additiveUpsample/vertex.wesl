// additiveUpsample/vertex.wesl — fullscreen covering-triangle vertex stage.
//
// Identical to compositor/vertex.wesl: synthesise three vertices that cover
// the entire viewport with UVs in [0, 1]².  The fragment stage samples
// the reduced-resolution offscreen at 'in.uv' with a linear sampler, which
// carries the magnification for free.

import package::additiveUpsample::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard 'big triangle' trick — see compositor/vertex.wesl for the
  // why-not-a-quad rationale.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
