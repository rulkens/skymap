// milkyWay/ismMap/orientationPresent.wesl — presents the GPU structure-tensor
// pass chain's crest orientation (ismMapOrientationField.wesl ->
// ismMapOrientationTensor.wesl -> ismMapOrientationTensorBlur.wesl ->
// ismMapOrientationCoherence.wesl), crossfaded with the analytic field's
// emission draw by weight render.orientationViewIntensity, same seam as
// ismMapPresent.wesl.
//
// The camera-ray reconstruction, disc-plane intersection and (r, theta)
// log-polar resample below are shared with ismMapPresent.wesl — see
// lib::camera::cameraRayFromUv, lib::util::rayPlaneY0 and
// ismMapPresentLib::logPolarUv for the derivations.
//
// Display rule: hue = orientation angle, value = coherence. The angle
// (0.5*atan2(sin2t, cos2t)) spans only (-pi/2, pi/2] — a filament has no
// head/tail, so the double-angle vector wraps at pi, not 2*pi — so it is
// scaled by 1/PI, not 1/(2*PI), to still fill the FULL hue wheel. That is
// what makes a genuine pitch reversal across corotation read as a hue FLIP
// rather than a half-saturated smear.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::camera::cameraRayFromUv;
import package::lib::util::rayPlaneY0;
import package::lib::util::hueToRgb;
import package::milkyWay::field::io::u;
import package::milkyWay::ismMap::ismMapPresentLib::logPolarUv;
import package::milkyWay::ismMap::ismMapPresentLib::ismMapEdgeFade;

// Still needed locally for the hue conversion below (angle/PI) — only the
// log-polar resample's own PI use moved into ismMapPresentLib.wesl.
const PI: f32 = 3.14159265358979;

// This galaxy's log-radial grid bounds — same shape as ismMapPresent.wesl's
// IsmMapGrid, written once per orientation-chain dispatch rather than every
// frame like io.wesl's 'u' above.
struct OrientationGrid {
  rMin: f32,
  rMax: f32,
}

@group(0) @binding(1) var orientationTex: texture_2d<f32>;
@group(0) @binding(2) var orientationSmp: sampler;
@group(0) @binding(3) var<uniform> grid: OrientationGrid;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = cameraRayFromUv(input.uv, u.camRight.xyz, u.camUp.xyz, u.camFwd.xyz, tanHalfFov, aspect, shift);
  let o = u.eye.xyz;

  // Disc-plane (y=0) intersection; a ray parallel to or diverging from the
  // plane has nothing to show.
  let t = rayPlaneY0(o, d);
  if (t <= 0.0) {
    return vec4<f32>(0.0);
  }
  let hit = o + d * t;

  let uvGrid = logPolarUv(hit, grid.rMin, grid.rMax);
  if (uvGrid.z < 0.5) {
    return vec4<f32>(0.0);
  }
  let azT = uvGrid.x;
  let ringT = uvGrid.y;
  // Linear filtering is safe here specifically because the texture packs
  // the (cos2t, sin2t) DOUBLE-ANGLE vector, not a bare angle — only that
  // form interpolates across the pi wrap without a false zero-crossing
  // (see ismMapOrientationCoherence.wesl's own header).
  let texel = textureSampleLevel(orientationTex, orientationSmp, vec2<f32>(azT, ringT), 0.0);

  // Fade the last few percent toward each radial edge, same as
  // ismMapPresent.wesl — presentation, not physics.
  let edgeFade = ismMapEdgeFade(ringT);

  let cos2t = texel.x;
  let sin2t = texel.y;
  let coherence = length(vec2<f32>(cos2t, sin2t));
  let angle = 0.5 * atan2(sin2t, cos2t);
  let hue = angle / PI + 0.5;
  let color = hueToRgb(hue) * coherence * edgeFade;

  // debugView.z is this view's own crossfade weight (io.wesl's debugView
  // doc), same role as dustPresent.wesl's debugView.x multiply.
  return vec4<f32>(color * u.debugView.z, 0.0);
}
