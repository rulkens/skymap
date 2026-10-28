// skyGrid/fragment.wesl — coordinate grids at infinity. Each pixel's world
// view ray is rotated into every enabled frame; lines sit at multiples of
// SPACING_DEG in latitude and longitude, antialiased by the screen-space
// derivative so they stay ~1 px wide at any zoom. Direction-only, so the
// grid is the same at every camera distance.
import package::skyGrid::io::Uniforms;
import package::skyGrid::io::VsOut;

@group(0) @binding(0) var<uniform> u: Uniforms;

const SPACING_DEG: f32 = 15.0;
const LINE_PX: f32 = 0.75;
const EQUATOR_GAIN: f32 = 2.5;
const LINE_ALPHA: f32 = 0.35;

// Coverage of a line at `offsetDeg` from it, with `pxDeg` degrees per pixel.
fn lineCoverage(offsetDeg: f32, pxDeg: f32) -> f32 {
  return 1.0 - smoothstep(LINE_PX * pxDeg, (LINE_PX + 1.0) * pxDeg, offsetDeg);
}

fn offGrid(deg: f32) -> f32 {
  return abs(deg - round(deg / SPACING_DEG) * SPACING_DEG);
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let rayDir = normalize(
    u.camForward
    + input.ndc.x * u.tanHalfFovY * u.aspect * u.camRight
    + input.ndc.y * u.tanHalfFovY * u.camUp,
  );

  var rgb = vec3<f32>(0.0);
  for (var i = 0u; i < 4u; i++) {
    let f = u.frames[i];
    // World -> frame is the transpose of the frame -> world rotation.
    let d = transpose(f.toWorld) * rayDir;
    let latDeg = degrees(asin(clamp(d.z, -1.0, 1.0)));
    let lonDeg = degrees(atan2(d.y, d.x));
    // atan2 jumps by 360 at the seam behind the frame's x axis; the same
    // angle measured from the opposite side has its seam elsewhere, so the
    // smaller derivative of the two is the true one.
    let lonAlt = degrees(atan2(-d.y, -d.x));
    let pxLat = fwidth(latDeg);
    let pxLon = min(fwidth(lonDeg), fwidth(lonAlt));

    let parallel = lineCoverage(offGrid(latDeg), pxLat);
    let equator = lineCoverage(abs(latDeg), pxLat) * EQUATOR_GAIN;
    // Meridians converge at the poles; let them go before they crowd.
    let meridian = lineCoverage(offGrid(lonDeg), pxLon)
      * (1.0 - smoothstep(75.0, 85.0, abs(latDeg)));

    rgb += f.color.rgb * f.color.a * max(max(parallel, meridian), equator);
  }
  let value = LINE_ALPHA * u.opacity;
  return vec4<f32>(rgb * value, 0.0);
}
