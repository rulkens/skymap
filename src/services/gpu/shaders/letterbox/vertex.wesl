// letterbox/vertex.wesl — one covering triangle at clip (-1,1), (3,1), (-1,-3); the
// renderer's scissor rect cuts each bar out of it. Family-local, as bloom/vertex.wesl is.

import package::letterbox::io::LetterboxOut;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> LetterboxOut {
  let cornerX = f32(((vertexIndex << 1u) & 2u));
  let cornerY = f32(vertexIndex & 2u);
  var out: LetterboxOut;
  out.pos = vec4<f32>(cornerX * 2.0 - 1.0, 1.0 - cornerY * 2.0, 0.0, 1.0);
  return out;
}
