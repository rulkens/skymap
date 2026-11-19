// occlusionMask/fragment.wesl — what stands in front of an overlay at each
// pixel, as one (coverage, distance km) texel read from the overlay joint
// ('lib::sceneDepth', group(1)). Coverage spans every 'foreground:0' row; the
// distance is the LAST row's alone, the limit 'lib::sceneDepth' states.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::sceneDepth::sceneTransmittance;
import package::lib::sceneDepth::sceneSurfaceKm;
import package::occlusionMask::io::NO_SURFACE_KM;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let fragXY = in.pos.xy;
  return vec4<f32>(
    1.0 - sceneTransmittance(fragXY),
    sceneSurfaceKm(fragXY, NO_SURFACE_KM),
    0.0,
    0.0,
  );
}
