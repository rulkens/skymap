// zoneOfAvoidance/band.wesl — the guide band's density march, the ONE home
// shared by the visual and pick fragment stages so the clickable footprint
// and the visible band cannot drift apart. Each fragment marches STEPS
// fixed steps across the [inner, outer] shell along its view ray (same
// camera-basis ray as horizonShell/fragment.wesl); the inner cavity is
// carved by the radial mask alone, so the march only clips the OUTER sphere.

import package::zoneOfAvoidance::io::Uniforms;
import package::lib::util::worldToGalactic;
import package::lib::util::raySphere;
import package::lib::masks::edgeBandMask;

const STEPS: u32 = 32u;
// Inner-rim feather width, as a fraction of the shell's radial span — fixed
// so the rim's softness stays constant regardless of the distance-fade knob.
const INNER_RIM_FRACTION: f32 = 0.05;

// Optical length (Mpc of obscured material) along the fragment's view ray,
// normalized by outerRadiusMpc: a dimensionless mask callers scale by the
// 'intensity' knob. 0.0 means the ray never crosses the shell.
fn bandDensityMask(u: Uniforms, ndc: vec2<f32>, fragCoordXY: vec2<f32>) -> f32 {
  let rayDir = normalize(
    u.camForward
    + ndc.x * u.tanHalfFovY * u.aspect * u.camRight
    + ndc.y * u.tanHalfFovY * u.camUp,
  );

  let outerHits = raySphere(u.cameraPosMpc, rayDir, vec3<f32>(0.0), u.outerRadiusMpc);
  if (outerHits.y < 0.0) {
    return 0.0; // ray never touches the outer sphere at all
  }
  let tStart = max(outerHits.x, 0.0);
  let tEnd = outerHits.y;
  if (tEnd <= tStart) {
    return 0.0;
  }

  let stepLen = (tEnd - tStart) / f32(STEPS);
  // Fragcoord hash jitters the march's start offset so the fixed steps
  // dissolve into noise instead of banding rings.
  let jitter = fract(sin(dot(fragCoordXY, vec2<f32>(12.9898, 78.233))) * 43758.5453);

  var accum = 0.0;
  for (var i: u32 = 0u; i < STEPS; i++) {
    let t = tStart + (f32(i) + jitter) * stepLen;
    let p = u.cameraPosMpc + rayDir * t;
    let r = length(p);

    // Radial profile: soft inner rim x exponential decay ('radialFalloffMpc'
    // e-folds it) x a hard outer rim — exp() alone never reaches zero.
    let innerRim = smoothstep(
      u.innerRadiusMpc,
      u.innerRadiusMpc + INNER_RIM_FRACTION * (u.outerRadiusMpc - u.innerRadiusMpc),
      r,
    );
    // Slider floor: the DebugPanel lets 'radialFalloffMpc' reach 0, which
    // would divide by zero below.
    let falloffMpc = max(u.radialFalloffMpc, 1e-3);
    let distanceFade = exp(-max(r - u.innerRadiusMpc, 0.0) / falloffMpc);
    let outerRim = 1.0 - smoothstep(0.9 * u.outerRadiusMpc, u.outerRadiusMpc, r);
    let radialMask = innerRim * distanceFade * outerRim;
    if (radialMask <= 0.0) {
      continue; // skip the trig below; also guards asin(z / r) since r > 0 here
    }

    // Dust extinction is worst toward the bulge and thinnest toward the
    // anticenter, so the wedge's half-width is a cosine bump over longitude.
    let galactic = worldToGalactic(p);
    let lon = atan2(galactic.y, galactic.x);
    // z and r round independently, so near the pole their ratio can land just
    // past ±1 — asin is undefined there and the NaN survives both tails' discards.
    let lat = asin(clamp(galactic.z / r, -1.0, 1.0));
    let bLimitDeg = u.anticenterDeg + (u.bulgeDeg - u.anticenterDeg) * (0.5 + 0.5 * cos(lon));
    let latDeg = degrees(lat);

    // 'edgeBandMask' is two-tailed; latitude maps onto an axis centred on the
    // plane (b=0 -> 0.5, b=±bLimitDeg -> 0/1), so a sample past the limit
    // clamps to a mask of 0. 'edgeSharpness' is in degrees.
    let bAxis = clamp(0.5 + 0.5 * (latDeg / bLimitDeg), 0.0, 1.0);
    // Slider floor: 'edgeSharpness' reaches 0, and a zero-width edgeBandMask
    // smoothstep is 0/0 = NaN exactly where bAxis lands on its 0/1 end stops.
    let edgeFadeAxis = clamp(u.edgeSharpness / (2.0 * bLimitDeg), 1e-3, 0.5);
    let latMask = edgeBandMask(bAxis, edgeFadeAxis);

    accum += radialMask * latMask;
  }

  return accum * stepLen / u.outerRadiusMpc;
}
