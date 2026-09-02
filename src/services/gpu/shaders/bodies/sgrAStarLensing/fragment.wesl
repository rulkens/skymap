// bodies/sgrAStarLensing/fragment.wesl — Schwarzschild ray classification:
// capture (black), escape (LUT-deflected sky-cubemap sample), or annulus
// (bounded emission march), composited over the escape/capture base.
//
// The LUT's captured samples upload as a finite sentinel (raw Infinity isn't
// guaranteed to survive a fast-math compiler), so 'CAPTURE_THRESHOLD_RAD' is
// a threshold check, not an isinf() test.

import package::lib::sgrAStarLensing::SgrAStarLensingUniforms;
import package::lib::math::rotateAroundAxis;
import package::lib::math::saturate;
import package::lib::math::TAU;
import package::lib::util::hash21Hq;

@group(0) @binding(0) var<uniform> u: SgrAStarLensingUniforms;
@group(0) @binding(1) var lutTex: texture_2d<f32>;
@group(0) @binding(2) var skyTex: texture_cube<f32>;
@group(0) @binding(3) var skySampler: sampler;

struct FsIn {
  @location(0) posRelCamM: vec3<f32>,
};

// Half the renderer's sentinel — the two sides need not agree exactly, only
// that this sits between any real (finite) bend angle and the sentinel.
const CAPTURE_THRESHOLD_RAD: f32 = 500.0;

const MARCH_STEPS: i32 = 48; // within the spec's 32-64-step bound
// Impact-parameter margin past outerRs past which the march is skipped
// (the gate in 'fs' carries the exactness argument).
const MARCH_GATE_MARGIN_RS: f32 = 4.0;
const SEGMENT_STEPS: i32 = MARCH_STEPS / 2; // split across the two segments
const RADIAL_EDGE_FEATHER_RS: f32 = 0.3; // annulus edge softening width
// Disc scale height and Doppler strength are uniform fields, not consts:
// both are live DebugPanel knobs.

// Two-tap manual lerp: r32float isn't sampler-filterable without the optional
// feature, hence textureLoad on a texture_2d<f32> (WebKit rejects the
// texture_1d Chrome accepts, docs/RENDERER.md). Either tap hitting the
// sentinel propagates it unblended, never averaging it with a real angle.
fn sampleLut(impactParamRs: f32) -> f32 {
  let span = max(u.lutMaxImpactParamRs - u.lutMinImpactParamRs, 1e-6);
  let t = saturate((impactParamRs - u.lutMinImpactParamRs) / span);
  let lastIndex = u.lutSampleCount - 1.0;
  let fIdx = t * lastIndex;
  let i0 = i32(floor(fIdx));
  let i1 = min(i0 + 1, i32(lastIndex));
  let a0 = textureLoad(lutTex, vec2<i32>(i0, 0), 0).r;
  let a1 = textureLoad(lutTex, vec2<i32>(i1, 0), 0).r;
  if (a0 >= CAPTURE_THRESHOLD_RAD || a1 >= CAPTURE_THRESHOLD_RAD) {
    return CAPTURE_THRESHOLD_RAD;
  }
  return mix(a0, a1, fract(fIdx));
}

// A fixed world-+Y reference, NOT the Galactic-Centre sky frame the S-star
// orbits use — that RA/Dec basis has no field in this uniform, and both
// angles are visual taste (BLACK_HOLES) rather than measurements.
fn diskNormal() -> vec3<f32> {
  let tilted = rotateAroundAxis(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), u.inclinationRad);
  return normalize(rotateAroundAxis(tilted, vec3<f32>(0.0, 1.0, 0.0), u.positionAngleRad));
}

// Per-sample density is the product of two SOFT profiles, not hard cutoffs,
// so a sample easing into the annulus fades in rather than switching on.
// 'viewDir' is the local ray direction at 'p' (straight in segment 1, bent in
// segment 2) — Doppler beaming reads whichever way the photon travels there.
fn annulusSampleContribution(p: vec3<f32>, normal: vec3<f32>, viewDir: vec3<f32>, stepLenM: f32) -> vec4<f32> {
  let distToPlaneRs = dot(p, normal) / u.schwarzschildRadiusM;
  let verticalWeight = exp(-(distToPlaneRs * distToPlaneRs) / (u.diskScaleHeightRs * u.diskScaleHeightRs));
  if (verticalWeight < 1e-3) {
    return vec4<f32>(0.0);
  }

  let inPlane = p - normal * dot(p, normal);
  let radialM = length(inPlane);
  let radialRs = radialM / u.schwarzschildRadiusM;
  let radialWeight = smoothstep(u.innerRs - RADIAL_EDGE_FEATHER_RS, u.innerRs + RADIAL_EDGE_FEATHER_RS, radialRs)
    * (1.0 - smoothstep(u.outerRs - RADIAL_EDGE_FEATHER_RS, u.outerRs + RADIAL_EDGE_FEATHER_RS, radialRs));
  if (radialWeight < 1e-3) {
    return vec4<f32>(0.0);
  }

  let radialDir = inPlane / max(radialM, 1e-6);
  let orbitDir = cross(normal, radialDir); // tangent to a circular orbit at this point
  let dopplerFactor = 1.0 + u.dopplerStrength * dot(orbitDir, -viewDir);
  // Kepler period ~ r^1.5 as a per-radius phase offset, not a fitted curve.
  let periodScale = pow(max(radialRs, 0.1), 1.5);
  let localPhase = u.flickerPhase + (radialRs / periodScale) * TAU;
  let flicker = 1.0 + u.flickerAmp * sin(localPhase);
  let redshift = 1.0 / sqrt(max(1.0 - 1.0 / radialRs, 0.05));
  let heat = saturate(1.0 - (radialRs - u.innerRs) / max(u.outerRs - u.innerRs, 1e-6));
  let tint = mix(vec3<f32>(1.0, 0.45, 0.15), vec3<f32>(1.0, 0.85, 0.65), heat);
  let falloff = 1.0 / max(radialRs * radialRs, 1.0); // radial profile: brightest at the inner edge, EHT-style

  let density = verticalWeight * radialWeight;
  let contribution = falloff * flicker * dopplerFactor * redshift * density * (stepLenM / u.schwarzschildRadiusM);
  return vec4<f32>(tint * contribution, saturate(contribution));
}

// Bounded march for the annulus's own emission, centred on 'closestT' rather
// than the camera — a window sized off 'outerRs' misses the hole entirely.

// Two-segment bent ray: segment 1 walks the straight camera ray to closest
// approach, segment 2 continues from that kink along 'deflectedDir' (the same
// rotation the escape branch samples the sky with). A captured ray has no LUT
// deflection to bend by, so it stays on segment 1 for its 24-step half of the
// budget and plunges to the horizon. Both segments share one 'jitterSeed'
// start offset, since they share one step length.
fn annulusEmission(rayDir: vec3<f32>, toAnchor: vec3<f32>, closestT: f32, deflectedDir: vec3<f32>, captured: bool, jitterSeed: vec2<f32>) -> vec4<f32> {
  let normal = diskNormal();
  let marchHalfM = u.outerRs * u.schwarzschildRadiusM * 1.5;
  let stepLenM = marchHalfM / f32(SEGMENT_STEPS);
  let jitter = hash21Hq(jitterSeed) * stepLenM;

  var emission = vec3<f32>(0.0);
  var coverage = 0.0;

  for (var i = 0; i < SEGMENT_STEPS; i++) {
    let t = max(closestT - marchHalfM + jitter + (f32(i) + 0.5) * stepLenM, 0.0);
    let p = rayDir * t - toAnchor; // position relative to the hole's centre
    let emissionSample = annulusSampleContribution(p, normal, rayDir, stepLenM);
    emission += emissionSample.rgb;
    coverage = max(coverage, emissionSample.a);
  }

  // On the SUMMED emission, not per-sample, and never on 'coverage' — that
  // stays keyed to the modeled density/radial profile, unscaled.
  if (captured) {
    return vec4<f32>(emission * u.emissionStrength * u.emissionTint, coverage);
  }

  let kink = rayDir * closestT; // camera-relative position at closest approach — the bend point
  for (var i = 0; i < SEGMENT_STEPS; i++) {
    let d = jitter + (f32(i) + 0.5) * stepLenM;
    let p = kink + deflectedDir * d - toAnchor;
    let emissionSample = annulusSampleContribution(p, normal, deflectedDir, stepLenM);
    emission += emissionSample.rgb;
    coverage = max(coverage, emissionSample.a);
  }

  return vec4<f32>(emission * u.emissionStrength * u.emissionTint, coverage);
}

@fragment
fn fs(in: FsIn, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let rayDir = normalize(in.posRelCamM);
  let toAnchor = u.anchorPosRelCamM;
  // Impact parameter: perpendicular distance from the hole to the camera
  // ray. Clamped forward — negative t is unreachable outside float error.
  let closestT = max(dot(toAnchor, rayDir), 0.0);
  let offsetVec = toAnchor - rayDir * closestT;
  let impactParamM = length(offsetVec);
  let impactParamRs = impactParamM / u.schwarzschildRadiusM;

  var color = vec3<f32>(0.0);
  var alpha = 0.0;

  // No 'b < lutMinImpactParamRs' early-out: sampleLut's saturate clamps that
  // domain to the sentinel texel anyway, and skipping the march there cuts a
  // black bite out of the shadow centre where the disk's front should read.
  // Past the LUT domain, deflection continues as the weak field's 2/b, so
  // scaling the clamped endpoint by lutMax/b extends it with EXACT continuity
  // at the handoff (~3% high in an already near-subpixel tail). tailScale = 1
  // inside the domain, leaving the capture sentinel untouched.
  let tailScale = min(u.lutMaxImpactParamRs / max(impactParamRs, 1e-6), 1.0);
  let bendAngle = sampleLut(impactParamRs) * tailScale;
  let captured = bendAngle >= CAPTURE_THRESHOLD_RAD;
  // Bruneton 2020 (arXiv:2010.08735): delta_prime = delta + deflection — the
  // backward lookup must rotate the ray TOWARD the hole to recover the
  // source's asymptotic direction. The apparent image is displaced outward,
  // so undoing that displacement moves inward; '-bendAngle' bends the wrong
  // way and the disk's far side never renders. Reused below as the march's
  // segment-2 bend — one basis for both consumers.
  let axis = normalize(cross(rayDir, toAnchor));
  let deflected = normalize(rotateAroundAxis(rayDir, axis, bendAngle));

  if (captured) {
    alpha = u.bandAlpha;
  } else {
    color = textureSampleLevel(skyTex, skySampler, deflected, 0.0).rgb;

    // Soft edge fade to the billboard's rim so the earlier-drawn roster
    // shows through — keyed to 'u.edgeFadeEndRs' (where deflection is
    // ~subpixel, layer-derived), NOT the LUT edge: fading at b = lutMax
    // blended a sky still deflected by degrees (~40 px) into the true sky,
    // a visible double image at the ring.
    let edgeFade = 1.0 - smoothstep(u.edgeFadeEndRs * u.edgeFadeStartFraction, u.edgeFadeEndRs, impactParamRs);
    alpha = u.bandAlpha * edgeFade;
  }

  // Output-identical skip: radialWeight is exactly 0 once the ray's closest
  // approach clears outerRs + RADIAL_EDGE_FEATHER_RS, and that approach is
  // >= b·cos(bend) > outerRs + feather for every b past the margin across the
  // tuning range. Captured rays always pass the gate.
  if (impactParamRs <= u.outerRs + MARCH_GATE_MARGIN_RS) {
    let annulus = annulusEmission(rayDir, toAnchor, closestT, deflected, captured, fragCoord.xy);
    color += annulus.rgb;
    alpha = max(alpha, u.bandAlpha * annulus.a);
  }

  return vec4<f32>(color * alpha, alpha); // premultiplied, per PREMULTIPLIED_OVER_BLEND
}
