// antiqueLook/vertex.wesl — the covering triangle (lib/fullscreenTri.wesl).

import package::lib::fullscreenTri::fullscreenVertex;
import package::antiqueLook::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  let tri = fullscreenVertex(vertexIndex);
  var out: VSOut;
  out.pos = tri.pos;
  out.uv = tri.uv;
  return out;
}
