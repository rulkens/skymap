// labels/fragmentOcclude.wesl — scene-attenuated variant of the MSDF label
// fragment stage. 'shadeMsdf' (lib/msdf.wesl) returns PREMULTIPLIED rgba, so
// one scalar multiply by 'sceneTransmittance' (0 under an opaque body, 1 over
// empty sky) dims colour and drops coverage together. 'occludeWeight' already
// carries the whole occlusion verdict, resolved in the vertex stage (vertexOcclude.wesl).

import package::labels::io::VsOut;
import package::lib::msdf::shadeMsdf;
import package::lib::sceneDepth::sceneTransmittance;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let shaded = shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
  return shaded * mix(1.0, sceneTransmittance(input.pos.xy), input.occludeWeight);
}
