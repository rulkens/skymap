// The decay draw's covering triangle (see volumeFieldRenderer.ts).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOut {
  return fullscreenVertex(vertexIndex);
}
