// bodies/sgrAStarLensing/fragment.wesl — Schwarzschild ray classification:
// capture (black), escape (LUT-deflected sky-cubemap sample), or annulus
// (bounded emission march), composited over the escape/capture base.
//
// 'Infinity' encoding: the LUT's captured samples (b <= b_c, see
// buildSchwarzschildDeflectionLut.ts) are non-finite; 'sgrAStarLensingRenderer
// .ts' replaces them with a finite sentinel before the r32float upload (raw
// Infinity isn't guaranteed to survive a fast-math shader compiler), so
// 'CAPTURE_THRESHOLD_RAD' below is a threshold check, not an isinf() test.

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
// Impact-parameter margin past outerRs beyond which the annulus march is
// skipped (see the gate in 'fs' for the exactness argument).
const MARCH_GATE_MARGIN_RS: f32 = 4.0;
// Split across the bent-ray march's two segments (Task 13c finding 3).
const SEGMENT_STEPS: i32 = MARCH_STEPS / 2;
const RADIAL_EDGE_FEATHER_RS: f32 = 0.3; // inner/outer annulus edge softening width
// The disc scale height and Doppler strength are uniform fields
// ('u.diskScaleHeightRs' / 'u.dopplerStrength'), not consts: both are live
// DebugPanel knobs.

// Two-tap manual lerp (r32float isn't sampler-filterable without the
// optional feature, hence textureLoad + a texture_2d<f32>, not texture_1d —
// WebKit rejects the latter, docs/RENDERER.md). Either tap hitting the
// sentinel propagates it unblended, never averaging a real angle with it.
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

// Tilt a fixed world-+Y reference by inclination, then spin its azimuth by
// positionAngle — NOT the Galactic-Centre sky frame S-star orbits use (that
// RA/Dec basis has no field in this uniform); BLACK_HOLES already calls both
// angles "visual taste", so a fixed world reference is a documented choice.
fn diskNormal() -> vec3<f32> {
  let tilted = rotateAroundAxis(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), u.inclinationRad);
  return normalize(rotateAroundAxis(tilted, vec3<f32>(0.0, 1.0, 0.0), u.positionAngleRad));
}

// Per-sample density is the product of two SOFT profiles (findings 1 & 2)
// instead of hard cutoffs, so a sample easing into the annulus fades in
// rather than switching on. 'viewDir' is the local ray direction at 'p'
// (straight in segment 1, bent in segment 2) — Doppler beaming reads off
// whichever way the photon is actually travelling there.
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
  // Kepler period ~ r^1.5: a cheap per-radius phase offset (closer annuli
  // lead the outer ones), not a fitted light curve — visual taste, as above.
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

// Bounded march (spec's 32-64-step bound) for the annulus's own emission,
// composited over the escape/capture base. Centred on 'closestT' (the ray's
// own closest approach) rather than t=0 (the camera) — the hole sits far
// outside a march window sized off 'outerRs' otherwise.

// Two-segment bent-ray approximation (finding 3): segment 1 walks the
// straight camera ray to closest approach; segment 2 continues from that
// kink along 'deflectedDir', the same rotated direction the escape branch
// samples the sky with. A captured ray has no LUT deflection to bend by, so
// it stays on segment 1 for the full budget and plunges to the horizon,
// same as before this fix. 'jitterSeed' offsets the march start per pixel
// (finding 1); both segments share one offset since they share one step
// length.
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

  // Applied to the SUMMED emission, not per-sample: a flat brightness/tint
  // multiplier on the whole march's output, not on the physical falloff that
  // feeds 'coverage' (which stays keyed to the modeled density/radial
  // profile, unscaled).
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
  // Impact parameter: perpendicular distance from the hole to the ray
  // through the camera (the origin). Clamped forward — the billboard faces
  // the camera and is centred on the anchor, so negative t is unreachable
  // outside float error at a corner fragment.
  let closestT = max(dot(toAnchor, rayDir), 0.0);
  let offsetVec = toAnchor - rayDir * closestT;
  let impactParamM = length(offsetVec);
  let impactParamRs = impactParamM / u.schwarzschildRadiusM;

  var color = vec3<f32>(0.0);
  var alpha = 0.0;

  // No 'b < lutMinImpactParamRs' early-out: sampleLut's saturate already
  // clamps that domain to the sentinel texel, so 'captured' below still
  // comes out true and the march still runs — skipping it here only cut a
  // black bite out of the shadow centre where the disk's front crossing
  // should read (Task 13d audit finding 3).
  // Beyond the LUT domain the deflection continues as ~1/b (weak field:
  // alpha = 2/b + O(1/b^2), r_s units). Scaling the clamped endpoint sample
  // by lutMax/b extends it with EXACT continuity at the handoff — no reliance
  // on the quadrature matching the asymptote — and only ~3% high in a tail
  // that is already near-subpixel. tailScale = 1 inside the domain, so the
  // capture sentinel (b <= b_c, far inside) is untouched.
  let tailScale = min(u.lutMaxImpactParamRs / max(impactParamRs, 1e-6), 1.0);
  let bendAngle = sampleLut(impactParamRs) * tailScale;
  let captured = bendAngle >= CAPTURE_THRESHOLD_RAD;
  // Bruneton: delta_prime = delta + deflection — the backward lookup must
  // rotate the ray TOWARD the hole to recover the source's asymptotic
  // direction. The apparent image is displaced outward, so undoing that
  // displacement moves inward; '-bendAngle' bent the wrong way, which is
  // why the disk's far side never rendered (Task 13d audit finding 1).
  // Reused below as the annulus march's segment-2 bend (finding 3) — one
  // basis for both consumers.
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

  // March only where it can contribute: every sample's radialWeight is
  // exactly 0 once the ray's closest approach clears outerRs +
  // RADIAL_EDGE_FEATHER_RS, and that approach is >= b·cos(bend) > outerRs +
  // feather for all b > outerRs + 4 across the tuning range — so the skip is
  // output-identical, and spares the 48-step march over the (much larger,
  // now fade-extended) escape region. Captured rays (b <= b_c ~ 2.6) always
  // pass this gate.
  if (impactParamRs <= u.outerRs + MARCH_GATE_MARGIN_RS) {
    let annulus = annulusEmission(rayDir, toAnchor, closestT, deflected, captured, fragCoord.xy);
    color += annulus.rgb;
    alpha = max(alpha, u.bandAlpha * annulus.a);
  }

  return vec4<f32>(color * alpha, alpha); // premultiplied, per PREMULTIPLIED_OVER_BLEND
}
