// bodies/starPoints/vertexPrint.wesl — the seeded stars' print stage for the
// antique look: one point per star in 'antique-print-points'
// (antiqueLook/shared/printPoint.wesl). Positions are camera-relative Mpc with a
// rebased view-projection, as vertex.wesl's.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::antiqueLook::shared::printPoint::PrintPointOut;
import package::antiqueLook::shared::printPoint::apparentMagnitude;
import package::antiqueLook::shared::printPoint::printPoint;

@group(0) @binding(0) var<uniform> cam: CameraUniforms;

@vertex
fn vs(
  @location(0) position: vec3<f32>,
  // x absolute magnitude, y fade.
  @location(1) magFade: vec2<f32>,
) -> PrintPointOut {
  let mag = apparentMagnitude(magFade.x, dot(position, position));
  return printPoint(worldToClip(cam, position), mag, magFade.y);
}
