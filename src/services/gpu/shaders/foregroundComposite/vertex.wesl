// foregroundComposite/vertex.wesl — fullscreen covering-triangle vertex stage.
//
// Identical to 'volumeUpsample/vertex.wesl' (and 'toneMap/vertex.wesl'):
// synthesise three vertices that cover the entire viewport with UVs in
// [0, 1]^2.  The fragment stage samples the foreground colour texture at
// 'in.uv' and emits it straight for the OVER blend.
//
// The covering-triangle trick generates one large triangle that encloses
// the full clip-space square, avoiding the diagonal seam a two-triangle
// quad would introduce.  Three vertices, one draw call, no index buffer.

import package::foregroundComposite::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard 'big triangle' trick -- see 'toneMap/vertex.wesl' for the
  // why-not-a-quad rationale.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
