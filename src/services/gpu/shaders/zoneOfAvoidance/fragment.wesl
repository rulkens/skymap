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

    // Radial rim mask: zero inside the cavity and outside the shell, with
    // 'radialFalloffMpc'-wide feathering at both rims — replaces the old
    // camera-distance mask, since every SAMPLE now carries its own radial
    // gradient.
    let radialMask = smoothstep(u.innerRadiusMpc, u.innerRadiusMpc + u.radialFalloffMpc, r)
      * (1.0 - smoothstep(u.outerRadiusMpc - u.radialFalloffMpc, u.outerRadiusMpc, r));
    if (radialMask <= 0.0) {
      continue; // skip the trig below; also guards asin(z / r) since r > 0 here
    }

    // WGSL port of Task 3's 'zoneOfAvoidanceBLimitDeg' TS twin
    // (utils/math/zoneOfAvoidanceBLimitDeg.ts): half-width is a cosine bump
    // over galactic longitude, widest toward the bulge (l=0).
    let galactic = worldToGalactic(p);
    let lon = atan2(galactic.y, galactic.x);
    let lat = asin(galactic.z / r);
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
  // order 1 (a ray grazing the full shell along the plane gives
  // opticalLength ≈ 2×outer).
  let opticalLength = accum * stepLen;
  let alpha = applyFade(u.intensity * opticalLength / u.outerRadiusMpc, u.fadeAlpha);
  if (alpha <= 0.0) {
    discard; // pure additive target — saves the blend
  }
  return vec4<f32>(u.color * alpha, alpha);
}
