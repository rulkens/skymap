// zoneOfAvoidance/fragment.wesl — galactic-plane dust-band guide shading.
//
// Each fragment builds its world-space view ray from the camera basis (same
// pattern as horizonShell/fragment.wesl), then finds where that ray crosses
// the [innerRadiusMpc, outerRadiusMpc] shell centred at the world origin
// (the catalog observer): the outer sphere's far wall (the usual case — the
// camera flies INSIDE the outer sphere at the guide's visible range), or the
// inner sphere's near wall when the ray points close enough to the origin to
// cross that cavity first. A ray that never touches the outer sphere at all
// discards.
//
// The hit point's galactic latitude then gates visibility against the
// longitude-dependent 'bLimitDeg' curve (Task 3's
// 'zoneOfAvoidanceBLimitDeg' — the shape is inlined here per its own
// promotion-on-second-consumer note; a shared lib fn is only worth
// extracting once Task 10's lettering needs the same formula).

import package::zoneOfAvoidance::io::Uniforms;
import package::zoneOfAvoidance::io::VsOut;
import package::lib::util::worldToGalactic;
import package::lib::util::raySphere;
import package::lib::masks::edgeBandMask;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let rayDir = normalize(
    u.camForward
    + input.ndc.x * u.tanHalfFovY * u.aspect * u.camRight
    + input.ndc.y * u.tanHalfFovY * u.camUp,
  );

  // ── Shell hit point ──────────────────────────────────────────────
  //
  // 'raySphere' returns (tNear, tFar) or the (-1, -1) miss sentinel — see
  // 'lib/util.wesl' for the derivation. The outer sphere is the primary
  // surface (the camera is normally INSIDE it, so its far wall is what's
  // visible, like the inside of a dome); the inner sphere occludes that
  // dome when the ray points close enough to the origin to cross the
  // cavity first — its NEAR wall wins if it's closer than the outer hit.
  let outerHits = raySphere(u.cameraPosMpc, rayDir, vec3<f32>(0.0), u.outerRadiusMpc);
  if (outerHits.y < 0.0) {
    discard; // ray never touches the outer sphere at all
  }
  var t = select(outerHits.y, outerHits.x, outerHits.x > 0.0);
  let innerHits = raySphere(u.cameraPosMpc, rayDir, vec3<f32>(0.0), u.innerRadiusMpc);
  if (innerHits.y > 0.0) {
    let tInner = select(innerHits.y, innerHits.x, innerHits.x > 0.0);
    if (tInner > 0.0 && tInner < t) {
      t = tInner;
    }
  }
  if (t < 0.0) {
    discard;
  }
  let hit = u.cameraPosMpc + rayDir * t;

  // ── Galactic latitude gate ───────────────────────────────────────
  //
  // 'worldToGalactic' is a pure rotation, so it's valid for the hit
  // position vector (relative to the world origin = Sun) directly.
  let galactic = worldToGalactic(hit);
  let lon = atan2(galactic.y, galactic.x);
  let lat = asin(galactic.z / length(galactic));

  // WGSL port of Task 3's 'zoneOfAvoidanceBLimitDeg' TS twin
  // (utils/math/zoneOfAvoidanceBLimitDeg.ts): the band's half-width is a
  // cosine bump over galactic longitude, widest toward the bulge (l=0),
  // narrowest toward the anticenter (l=π).
  let bLimitDeg = u.anticenterDeg + (u.bulgeDeg - u.anticenterDeg) * (0.5 + 0.5 * cos(lon));
  let latDeg = degrees(lat);
  if (abs(latDeg) > bLimitDeg) {
    discard;
  }

  // ── Shading ───────────────────────────────────────────────────────
  //
  // 'edgeBandMask' is a two-TAILED mask (fade in / flat / fade out over a
  // [0, 1] axis) — reused here for a symmetric ONE-threshold shape by
  // mapping latitude to an axis centred on the galactic plane (b=0 ->
  // 0.5, b=±bLimitDeg -> 0/1), so both hemispheres' edges feather via the
  // same helper. 'edgeSharpness' is in degrees; the axis spans
  // 2*bLimitDeg degrees end to end.
  let bAxis = clamp(0.5 + 0.5 * (latDeg / bLimitDeg), 0.0, 1.0);
  let edgeFadeAxis = clamp(u.edgeSharpness / (2.0 * bLimitDeg), 0.0, 0.5);
  let latMask = edgeBandMask(bAxis, edgeFadeAxis);

  // Radial falloff softens the band's own visible range (the guide is only
  // meaningful for cameras roughly between the inner and outer radii) —
  // keyed on the CAMERA's distance from the origin rather than the hit
  // point's (which sits exactly on one of the two sphere surfaces by
  // construction, so it carries no radial gradient of its own).
  // 'radialFalloffMpc' already arrived in Mpc — the CPU side converts the
  // tuning knob's normalised [0, 1] fraction against the shell span before
  // writing the uniform (see zoneOfAvoidanceRenderer.ts), so this shader has
  // exactly one currency to work in.
  let camR = length(u.cameraPosMpc);
  let innerEdge = smoothstep(u.innerRadiusMpc, u.innerRadiusMpc + u.radialFalloffMpc, camR);
  let outerEdge = 1.0 - smoothstep(u.outerRadiusMpc - u.radialFalloffMpc, u.outerRadiusMpc, camR);
  let radialMask = innerEdge * outerEdge;

  let alpha = applyFade(latMask * radialMask * u.intensity, u.fadeAlpha);
  return vec4<f32>(u.color * alpha, alpha);
}
