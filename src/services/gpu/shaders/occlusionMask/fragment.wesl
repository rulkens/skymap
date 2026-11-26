// occlusionMask/fragment.wesl — what stands in front of an overlay at each
// pixel, as one (coverage, distance km) texel read from the overlay joint
// ('lib::sceneDepth', group(1)). Coverage spans every 'foreground:0' row; the
// distance is the LAST row's alone, the limit 'lib::sceneDepth' states.
// The target may be smaller than the foreground: a texel then takes the block
// of foreground texels under it, the MOST coverage and the NEAREST surface, so
// a thin occluder survives and no caption bleeds onto a body's edge.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::sceneDepth::sceneColorTex;
import package::lib::sceneDepth::sceneTransmittance;
import package::lib::sceneDepth::sceneSurfaceKm;
import package::occlusionMask::io::NO_SURFACE_KM;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let scenePx = vec2<f32>(textureDimensions(sceneColorTex));
  let centre = in.uv * scenePx;
  // Foreground texels per mask texel, off the uv's own step: no scale constant.
  let block = max(vec2<i32>(round(vec2<f32>(dpdx(centre.x), dpdy(centre.y)))), vec2<i32>(1));
  let origin = vec2<i32>(floor(centre - 0.5 * vec2<f32>(block)));
  var coverage = 0.0;
  var surfaceKm = NO_SURFACE_KM;
  for (var row = 0; row < block.y; row++) {
    for (var column = 0; column < block.x; column++) {
      let texel = clamp(origin + vec2<i32>(column, row), vec2<i32>(0), vec2<i32>(scenePx) - 1);
      let fragXY = vec2<f32>(texel) + 0.5;
      coverage = max(coverage, 1.0 - sceneTransmittance(fragXY));
      surfaceKm = min(surfaceKm, sceneSurfaceKm(fragXY, NO_SURFACE_KM));
    }
  }
  return vec4<f32>(coverage, surfaceKm, 0.0, 0.0);
}
