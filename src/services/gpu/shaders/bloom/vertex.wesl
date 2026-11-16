// bloom/vertex.wesl — every bloom pipeline's vertex stage: one covering triangle at
// clip (-1,1), (3,1), (-1,-3), with no shared edge to drop pixels along. Family-local
// like compositor/vertex.wesl, not lib/fullscreenTri.wesl: disjoint source per family
// means a change in one never perturbs another's compiled output.

import package::bloom::io::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOut {
  let cornerX = f32(((vertexIndex << 1u) & 2u));
  let cornerY = f32(vertexIndex & 2u);
  var out: FullscreenOut;
  out.pos = vec4<f32>(cornerX * 2.0 - 1.0, 1.0 - cornerY * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(cornerX, cornerY);
  return out;
}
