// points/vertexPrint.wesl — the galaxy points' print stage for the antique look:
// one point per galaxy in 'antique-print-points' (antiqueLook/printPoint.wesl),
// at the intensity the visual stage gives it, so a culled or faded galaxy (a
// filter, the Malmquist cut, a resolved disk's crossfade) never prints a dot.
// Bindings as vertex.wesl's, so the canonical source and focus layouts bind.

import package::galaxyCatalog::points::io::Uniforms;
import package::galaxyCatalog::points::io::PerVertex;
import package::galaxyCatalog::points::vertexBody::galaxyPointVertex;
import package::lib::camera::worldToClip;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::focusUniforms::FocusUniforms;
import package::antiqueLook::printPoint::PrintPointOut;
import package::antiqueLook::printPoint::printGalaxyPoint;
import package::antiqueLook::printPoint::printPointNone;

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(2) @binding(0) var<uniform> source: SourceUniforms;
@group(3) @binding(0) var<uniform> focus: FocusUniforms;

@vertex
fn vs(@builtin(instance_index) ii: u32, p: PerVertex) -> PrintPointOut {
  let v = galaxyPointVertex(0u, ii, p, u, source, focus);
  // The visual stage's cull: a clip position outside the NDC cube.
  if (v.clip.x == 2.0 * v.clip.w) {
    return printPointNone();
  }
  // A highlight's tint is its colour times the intensity: its brightest channel stands in.
  let tint = v.instanceTint.rgb;
  return printGalaxyPoint(worldToClip(u.cam, p.position), max(tint.r, max(tint.g, tint.b)));
}
