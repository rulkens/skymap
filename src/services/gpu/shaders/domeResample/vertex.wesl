// domeResample/vertex.wesl — the resample's vertex stage. No per-vertex
// inputs and no bindings: it draws the covering triangle from
// 'lib::fullscreenTri' alone, so nothing but the entry point lives here.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}
