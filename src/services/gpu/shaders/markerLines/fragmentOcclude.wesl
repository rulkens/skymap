// markerLines/fragmentOcclude.wesl — the leader-line mirror of
// labels/fragmentOcclude.wesl (see that file for the occlusion contract);
// 'shadeLine' returns premultiplied rgba, scaled the same way by
// 'sceneTransmittance', and 'occludeWeight' is judged at the connector's
// SUBJECT end, not per rendered pixel along the line.

import package::markerLines::io::VsOut;
import package::markerLines::fragment::shadeLine;
import package::lib::sceneDepth::sceneTransmittance;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeLine(input) * mix(1.0, sceneTransmittance(input.pos.xy), input.occludeWeight);
}
