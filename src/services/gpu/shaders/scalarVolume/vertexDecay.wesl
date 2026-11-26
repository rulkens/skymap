// The decay draw's covering triangle: one pass over the whole density target
// ahead of the field marches (see decayFragment.wesl).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOut {
  return fullscreenVertex(vertexIndex);
}
