// zoneOfAvoidance/fragmentPick.wesl — analytic pick for the galactic-plane
// dust-band guide.
//
// Reruns fragment.wesl's exact ray-march + wedge discard so a click only
// registers where the band would actually be visible; on a hit it writes
// the band's constant singleton id and the depth of the shell's near
// entry point, projected through the caller-bound CameraUniforms.
// vertex.wesl's group(0) Uniforms binding is unused by 'vs', freeing
// group(0) for that caller-bound camera; the wedge/camera-basis Uniforms
// this march needs moves to group(1) instead.

import package::zoneOfAvoidance::io::Uniforms;
import package::zoneOfAvoidance::io::VsOut;
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::util::worldToGalactic;
import package::lib::util::raySphere;
import package::lib::masks::edgeBandMask;
import package::lib::fadeUniforms::applyFade;

const STEPS: u32 = 32u;
const INNER_RIM_FRACTION: f32 = 0.05;

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
    let lat = asin(galactic.z / r);
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
  // Shell's near entry point along this ray — a defensible single depth
  // for a fragment that is really an accumulated volume, and the point
  // most likely to be occluded correctly by whatever drew in front of it.
  let hitPoint = u.cameraPosMpc + rayDir * tStart;
  let clip = worldToClip(cam, hitPoint);
  out.depth = clip.z / clip.w;
  return out;
}
