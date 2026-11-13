// bloom/vertex.wesl — every bloom pipeline's vertex stage: one covering triangle at
// clip (-1,1), (3,1), (-1,-3), with no shared edge to drop pixels along. Family-local
// like compositor/vertex.wesl, not lib/fullscreenTri.wesl: disjoint source per family
// means a change in one never perturbs another's compiled output.

import package::bloom::io::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: FullscreenOut;
  out.pos = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
