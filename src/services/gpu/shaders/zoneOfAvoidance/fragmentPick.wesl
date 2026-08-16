// zoneOfAvoidance/fragmentPick.wesl — analytic pick for the galactic-plane
// dust-band guide.
//
// Reruns fragment.wesl's exact ray-march + wedge discard so a click only
// registers where the band would actually be visible; on a hit it writes
// the band's constant singleton id and a fixed fallback depth (see
// PICK_FALLBACK_DEPTH — the camera sits INSIDE the shell throughout this
// layer's visibility window, so there is no real entry-point depth to
// project). vertex.wesl's group(0) Uniforms binding is unused by 'vs',
// freeing group(0) for the caller-bound camera, declared but unread below;
// the wedge/camera-basis Uniforms this march needs moves to group(1).

import package::zoneOfAvoidance::io::Uniforms;
import package::zoneOfAvoidance::io::VsOut;
import package::lib::camera::CameraUniforms;
import package::lib::util::worldToGalactic;
import package::lib::util::raySphere;
import package::lib::masks::edgeBandMask;
import package::lib::fadeUniforms::applyFade;

const STEPS: u32 = 32u;
const INNER_RIM_FRACTION: f32 = 0.05;
// Sentinel depth for a fragment with no real single-point distance (the
// band is a volume, not a surface): COSMO's pick pass is non-reversed-Z,
// 'less'-compares against a far-plane clear of 1.0 (zoneOfAvoidanceRenderer.ts's
// pickPipeline depthStencil), so this must be < 1.0 by more than an f32 ULP
// (~1.2e-7) to reliably beat the clear, while staying close enough to 1.0
// that it loses to every real pickable's (much nearer) depth.
const PICK_FALLBACK_DEPTH: f32 = 0.999999;

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(1) @binding(0) var<uniform> u: Uniforms;

struct PickFSOut {
  @location(0) id: vec4<u32>,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fsPick(input: VsOut) -> PickFSOut {
  let rayDir = normalize(
    u.camForward
    + input.ndc.x * u.tanHalfFovY * u.aspect * u.camRight
    + input.ndc.y * u.tanHalfFovY * u.camUp,
  );

  let outerHits = raySphere(u.cameraPosMpc, rayDir, vec3<f32>(0.0), u.outerRadiusMpc);
  if (outerHits.y < 0.0) {
    discard;
  }
  let tStart = max(outerHits.x, 0.0);
  let tEnd = outerHits.y;
  if (tEnd <= tStart) {
    discard;
  }

  let stepLen = (tEnd - tStart) / f32(STEPS);
  let jitter = fract(sin(dot(input.clipPos.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453);

  var accum = 0.0;
  for (var i: u32 = 0u; i < STEPS; i++) {
    let t = tStart + (f32(i) + jitter) * stepLen;
    let p = u.cameraPosMpc + rayDir * t;
    let r = length(p);

    let innerRim = smoothstep(
      u.innerRadiusMpc,
      u.innerRadiusMpc + INNER_RIM_FRACTION * (u.outerRadiusMpc - u.innerRadiusMpc),
      r,
    );
    let falloffMpc = max(u.radialFalloffMpc, 1e-3);
    let distanceFade = exp(-max(r - u.innerRadiusMpc, 0.0) / falloffMpc);
    let outerRim = 1.0 - smoothstep(0.9 * u.outerRadiusMpc, u.outerRadiusMpc, r);
    let radialMask = innerRim * distanceFade * outerRim;
    if (radialMask <= 0.0) {
      continue;
    }

    let galactic = worldToGalactic(p);
    let lon = atan2(galactic.y, galactic.x);
    // z and r round independently, so near the pole their ratio can land
    // just past ±1 — asin is undefined there and the NaN survives the '<= 0' discards below.
    let lat = asin(clamp(galactic.z / r, -1.0, 1.0));
    let bLimitDeg = u.anticenterDeg + (u.bulgeDeg - u.anticenterDeg) * (0.5 + 0.5 * cos(lon));
    let latDeg = degrees(lat);

    let bAxis = clamp(0.5 + 0.5 * (latDeg / bLimitDeg), 0.0, 1.0);
    let edgeFadeAxis = clamp(u.edgeSharpness / (2.0 * bLimitDeg), 0.0, 0.5);
    let latMask = edgeBandMask(bAxis, edgeFadeAxis);

    accum += radialMask * latMask;
  }

  let opticalLength = accum * stepLen;
  let alpha = applyFade(u.intensity * opticalLength / u.outerRadiusMpc, u.fadeAlpha);
  if (alpha <= 0.0) {
    discard;
  }

  var out: PickFSOut;
  out.id = vec4<u32>(u.packedId, 0u, 0u, 0u);
  // Last-resort hit: the band is an enveloping background haze, so it must
  // always lose to whatever real pickable drew here first (see
  // PICK_FALLBACK_DEPTH above).
  out.depth = PICK_FALLBACK_DEPTH;
  return out;
}
