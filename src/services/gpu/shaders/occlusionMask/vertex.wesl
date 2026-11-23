// occlusionMask/vertex.wesl — the mask's vertex stage: the covering triangle
// from 'lib::fullscreenTri', no inputs and no bindings.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOut {
  return fullscreenVertex(vertexIndex);
}
