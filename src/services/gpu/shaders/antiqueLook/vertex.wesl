// antiqueLook/vertex.wesl — the covering triangle (lib/fullscreenTri.wesl).

import package::lib::fullscreenTri::fullscreenVertex;
import package::antiqueLook::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  let f = fullscreenVertex(vi);
  var o: VSOut;
  o.pos = f.pos;
  o.uv = f.uv;
  return o;
}
