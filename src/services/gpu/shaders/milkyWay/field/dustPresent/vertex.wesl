// dustPresent/vertex.wesl — fullscreen-triangle vertex stage for the "JWST"
// dust-column view. No own varyings: fullscreenVertex's FullscreenOut (uv)
// is all fragment.wesl needs to recover the NDC it reconstructs its ray
// from. Declared locally per lib/fullscreenTri.wesl's own convention (the
// linker doesn't preserve an imported entry point's name for the pipeline's
// entryPoint lookup).

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}
