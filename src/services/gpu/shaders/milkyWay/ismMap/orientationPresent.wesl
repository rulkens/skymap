// milkyWay/sfMap/orientationPresent.wesl — presents the GPU structure-tensor
// pass chain's crest orientation (sfMapOrientationField.wesl ->
// sfMapOrientationTensor.wesl -> sfMapOrientationTensorBlur.wesl ->
// sfMapOrientationCoherence.wesl), crossfaded with the analytic field's
// emission draw by weight render.orientationViewIntensity, same seam as
// sfMapPresent.wesl.
//
// The camera-ray -> (r, theta) log-polar resample below is
// sfMapPresent.wesl's own disc-plane-intersection mapping, copied rather
// than re-derived — see that file's header for the derivation.
//
// Display rule: hue = orientation angle, value = coherence. The angle
// (0.5*atan2(sin2t, cos2t)) spans only (-pi/2, pi/2] — a filament has no
// head/tail, so the double-angle vector wraps at pi, not 2*pi — so it is
// scaled by 1/PI, not 1/(2*PI), to still fill the FULL hue wheel. That is
// what makes a genuine pitch reversal across corotation read as a hue FLIP
// rather than a half-saturated smear.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::milkyWay::field::io::u;

const PI: f32 = 3.14159265358979;

// This galaxy's log-radial grid bounds — same shape as sfMapPresent.wesl's
// SfMapGrid, written once per orientation-chain dispatch rather than every
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

// Fully-saturated hue -> rgb for hue in [0, 1) — the same branch-free
// triangle-wave reconstruction pickDebugOverlay/fragment.wesl uses (S=1,
// V=1 slice; the caller scales by the desired value/brightness).
fn hueToRgb(h: f32) -> vec3<f32> {
  let r = abs(h * 6.0 - 3.0) - 1.0;
  let g = 2.0 - abs(h * 6.0 - 2.0);
  let b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let ndcX = input.uv.x * 2.0 - 1.0;
  let ndcY = 1.0 - input.uv.y * 2.0;
  let d = normalize(
    u.camRight.xyz * ((ndcX + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (ndcY * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  // Disc-plane (y=0) intersection; a ray parallel to or diverging from the
  // plane has nothing to show.
  if (abs(d.y) < 1e-6) {
    return vec4<f32>(0.0);
  }
  let t = -o.y / d.y;
  if (t <= 0.0) {
    return vec4<f32>(0.0);
  }
  let hit = o + d * t;
  let r = length(hit.xz);
  let theta = atan2(hit.z, hit.x);

  if (r < grid.rMin || r > grid.rMax) {
    return vec4<f32>(0.0);
  }
  let ringT = log(r / grid.rMin) / log(grid.rMax / grid.rMin);
  let azT = theta / (2.0 * PI) + select(0.0, 1.0, theta < 0.0);
  // Linear filtering is safe here specifically because the texture packs
  // the (cos2t, sin2t) DOUBLE-ANGLE vector, not a bare angle — only that
  // form interpolates across the pi wrap without a false zero-crossing
  // (see sfMapOrientationCoherence.wesl's own header).
  let texel = textureSampleLevel(orientationTex, orientationSmp, vec2<f32>(azT, ringT), 0.0);

  // Fade the last few percent toward each radial edge, same as
  // sfMapPresent.wesl — presentation, not physics.
  let edgeFade = smoothstep(0.0, 0.03, ringT) * (1.0 - smoothstep(0.94, 1.0, ringT));

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
