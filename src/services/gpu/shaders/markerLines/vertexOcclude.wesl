// markerLines/vertexOcclude.wesl — the scene-attenuated thick-line vertex
// stage, this file's twin to labels/vertexOcclude.wesl (same own-module
// reason: no group(1) in the plain pipeline's layout). Judges the
// connector's 'fromWorld' — the subject end — not per line pixel.

import package::markerLines::io::VsIn;
import package::markerLines::io::VsOut;
// 'u' is imported, not redeclared: a second '@group(0) @binding(0)' here
// would conflict with vertex.wesl's existing declaration.
import package::markerLines::vertex::u;
import package::markerLines::vertex::expandMarkerLineQuad;
import package::lib::sceneDepth::subjectDepthVerdict;

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let verdict = subjectDepthVerdict(u.cam, input.fromAndWidth.xyz, input.occludeNearKm);
  return expandMarkerLineQuad(input, max(input.occludeWeight, verdict));
}
