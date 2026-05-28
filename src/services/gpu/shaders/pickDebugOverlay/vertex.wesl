// pickDebugOverlay/vertex.wesl — fullscreen covering-triangle stage.
//
// Synthesise three vertices that cover the entire viewport with UVs
// in [0, 1]².  The fragment stage uses 'uv * textureDimensions' to
// index the r32uint pick texture via 'textureLoad'.
//
// Standard 'big triangle' trick — see toneMap/vertex.wesl for why
// one over-sized triangle beats a quad-of-two-triangles (no shared
// edge, no helper invocations, one less vertex).

import package::pickDebugOverlay::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
