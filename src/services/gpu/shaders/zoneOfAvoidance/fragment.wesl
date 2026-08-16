// zoneOfAvoidance/fragment.wesl — galactic-plane dust-band guide shading.
//
// The band is a radially extruded wedge, not a dome decal: each fragment
// marches STEPS fixed steps across the [inner, outer] shell along its view
// ray (same camera-basis-ray construction as horizonShell/fragment.wesl),
// accumulating an "optical length" of obscured material from a per-sample
// radial-rim mask x galactic-latitude mask. The inner cavity is carved by
// the radial mask alone — the march segment only clips the outer sphere.

import package::zoneOfAvoidance::io::Uniforms;
import package::zoneOfAvoidance::io::VsOut;
import package::lib::util::worldToGalactic;
import package::lib::util::raySphere;
import package::lib::masks::edgeBandMask;
import package::lib::fadeUniforms::applyFade;

const STEPS: u32 = 32u;
// Inner-rim feather width, as a fraction of the shell's radial span — fixed
// so the rim's softness stays constant regardless of the distance-fade knob.
const INNER_RIM_FRACTION: f32 = 0.05;

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let rayDir = normalize(
    u.camForward
    + input.ndc.x * u.tanHalfFovY * u.aspect * u.camRight
    + input.ndc.y * u.tanHalfFovY * u.camUp,
  );

  let outerHits = raySphere(u.cameraPosMpc, rayDir, vec3<f32>(0.0), u.outerRadiusMpc);
  if (outerHits.y < 0.0) {
    discard; // ray never touches the outer sphere at all
  }
  let tStart = max(outerHits.x, 0.0);
  let tEnd = outerHits.y;
  if (tEnd <= tStart) {
    discard;
  }

  let stepLen = (tEnd - tStart) / f32(STEPS);
  // Fragcoord hash jitters the march's start offset so the fixed steps
  // dissolve into noise instead of banding rings.
  let jitter = fract(sin(dot(input.clipPos.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);

  var accum = 0.0;
  for (var i: u32 = 0u; i < STEPS; i++) {
    let t = tStart + (f32(i) + jitter) * stepLen;
    let p = u.cameraPosMpc + rayDir * t;
    let r = length(p);

    // Radial density profile: a soft inner rim over a small FIXED width
    // (decoupled from the knob) x an exponential decay from the inner rim
    // outward, with 'radialFalloffMpc' as the e-folding length (the knob) x
    // a hard outer-rim guarantee, since exp() alone never reaches zero. The
    // veil is strongest just past the cavity and fades toward the survey
    // edge, replacing the old flat plateau with symmetric rim ramps.
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

    // WGSL port of the 'zoneOfAvoidanceBLimitDeg' TS twin
    // (utils/math/zoneOfAvoidanceBLimitDeg.ts) — keep in lockstep: half-width
    // is a cosine bump over galactic longitude, widest toward the bulge (l=0).
    let galactic = worldToGalactic(p);
    let lon = atan2(galactic.y, galactic.x);
    // z and r round independently, so near the pole their ratio can land
    // just past ±1 — asin is undefined there and the NaN survives the '<= 0' discards below.
    let lat = asin(clamp(galactic.z / r, -1.0, 1.0));
    let bLimitDeg = u.anticenterDeg + (u.bulgeDeg - u.anticenterDeg) * (0.5 + 0.5 * cos(lon));
    let latDeg = degrees(lat);

    // 'edgeBandMask' is two-tailed; reused here for a symmetric
    // one-threshold shape by mapping latitude onto an axis centred on the
    // plane (b=0 -> 0.5, b=±bLimitDeg -> 0/1) — a sample beyond bLimitDeg
    // maps outside [0, 1] and clamps to a mask of 0. 'edgeSharpness' is
    // in degrees.
    let bAxis = clamp(0.5 + 0.5 * (latDeg / bLimitDeg), 0.0, 1.0);
    let edgeFadeAxis = clamp(u.edgeSharpness / (2.0 * bLimitDeg), 0.0, 0.5);
    let latMask = edgeBandMask(bAxis, edgeFadeAxis);

    accum += radialMask * latMask;
  }

  // opticalLength is Mpc of obscured material along the ray; the
  // outerRadiusMpc normalization keeps 'intensity' a dimensionless knob of
  // order 1. The old flat-plateau mask made opticalLength ≈ 2×outer for a
  // ray grazing the full shell along the plane; under the exponential
  // distance decay that ceiling only holds as radialFalloffMpc → ∞ — at the
  // default falloff, opticalLength is well under 2×outer.
  let opticalLength = accum * stepLen;
  let alpha = applyFade(u.intensity * opticalLength / u.outerRadiusMpc, u.fadeAlpha);
  if (alpha <= 0.0) {
    discard; // pure additive target — saves the blend
  }
  return vec4<f32>(u.color * alpha, alpha);
}
