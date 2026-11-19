// domeResample/fragmentOcclusion.wesl — the five faces' occlusion masks
// ('occlusionMask::io') resampled into one mask on the fisheye image, by the
// colour resample's own face choice. ONE nearest texel per pixel: averaging
// distances across a silhouette invents a surface that is not there.

import package::domeResample::fisheye::fisheyeFaceTap;
import package::lib::fullscreenTri::FullscreenOut;
import package::occlusionMask::io::NO_SURFACE_KM;

@group(0) @binding(0) var faceMasks: texture_2d_array<f32>;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let tap = fisheyeFaceTap(vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0));
  if (!tap.inside) {
    return vec4<f32>(0.0, NO_SURFACE_KM, 0.0, 0.0);
  }
  let sizePx = vec2<i32>(textureDimensions(faceMasks));
  let texel = clamp(vec2<i32>(tap.uv * vec2<f32>(sizePx)), vec2<i32>(0), sizePx - 1);
  return textureLoad(faceMasks, texel, tap.layer, 0);
}
