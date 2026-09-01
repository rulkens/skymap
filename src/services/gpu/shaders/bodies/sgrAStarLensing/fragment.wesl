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
const DISK_HALF_THICKNESS_RS: f32 = 0.15; // thin-disk approximation, tuned for looks
const DOPPLER_STRENGTH: f32 = 0.6; // tuned for looks — see BLACK_HOLES's own "visual taste" note

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

// Bounded march (spec's 32-64-step bound) for the annulus's own emission,
// composited over the escape/capture base. Centred on 'closestT' (the ray's
// own closest approach to the hole, computed once in 'fs') rather than on
// t=0 (the camera): the hole sits at 'length(toAnchor)' from the camera,
// almost always far outside a 't in [0, marchHalfM]' window sized off
// 'outerRs', so marching from the camera would miss the disk for virtually
// the whole fade band. Returns (linear emission, coverage); coverage feeds
// the caller's alpha, not the light itself.
fn annulusEmission(rayDir: vec3<f32>, toAnchor: vec3<f32>, closestT: f32) -> vec4<f32> {
  let normal = diskNormal();
  let marchHalfM = u.outerRs * u.schwarzschildRadiusM * 1.5;
  let stepLenM = (2.0 * marchHalfM) / f32(MARCH_STEPS);
  let halfThicknessM = DISK_HALF_THICKNESS_RS * u.schwarzschildRadiusM;

  var emission = vec3<f32>(0.0);
  var coverage = 0.0;
  for (var i = 0; i < MARCH_STEPS; i++) {
    let t = max(closestT - marchHalfM + (f32(i) + 0.5) * stepLenM, 0.0);
    let p = rayDir * t - toAnchor; // position relative to the hole's centre
    let distToPlane = dot(p, normal);
    if (abs(distToPlane) > halfThicknessM) {
      continue;
    }
    let inPlane = p - normal * distToPlane;
    let radialM = length(inPlane);
    let radialRs = radialM / u.schwarzschildRadiusM;
    if (radialRs < u.innerRs || radialRs > u.outerRs) {
      continue;
    }

    let radialDir = inPlane / max(radialM, 1e-6);
    let orbitDir = cross(normal, radialDir); // tangent to a circular orbit at this point
    let dopplerFactor = 1.0 + DOPPLER_STRENGTH * dot(orbitDir, -rayDir);
    // Kepler period ~ r^1.5: a cheap per-radius phase offset (closer annuli
    // lead the outer ones), not a fitted light curve — visual taste, as above.
    let periodScale = pow(max(radialRs, 0.1), 1.5);
    let localPhase = u.flickerPhase + (radialRs / periodScale) * TAU;
    let flicker = 1.0 + u.flickerAmp * sin(localPhase);
    let redshift = 1.0 / sqrt(max(1.0 - 1.0 / radialRs, 0.05));
    let heat = saturate(1.0 - (radialRs - u.innerRs) / max(u.outerRs - u.innerRs, 1e-6));
    let tint = mix(vec3<f32>(1.0, 0.45, 0.15), vec3<f32>(1.0, 0.85, 0.65), heat);
    let falloff = 1.0 / max(radialRs * radialRs, 1.0);

    let contribution = falloff * flicker * dopplerFactor * redshift * (stepLenM / u.schwarzschildRadiusM);
    emission += tint * contribution;
    coverage = max(coverage, saturate(contribution));
  }
  return vec4<f32>(emission, coverage);
}

@fragment
fn fs(in: FsIn) -> @location(0) vec4<f32> {
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

  if (impactParamRs < u.lutMinImpactParamRs) {
    alpha = u.bandAlpha; // below the LUT's own domain — deep in the capture region
  } else {
    let bendAngle = sampleLut(impactParamRs);
    if (bendAngle >= CAPTURE_THRESHOLD_RAD) {
      alpha = u.bandAlpha;
    } else {
      // Lensing displaces the apparent background AWAY from the lens centre
      // (Einstein-ring displacement): rotate the ray away from the hole by
      // the LUT's bend angle to recover the source's asymptotic direction.
      // Sign/axis unverified visually (Task 17 gate); flip if it reads backward.
      let axis = normalize(cross(rayDir, toAnchor));
      let deflected = normalize(rotateAroundAxis(rayDir, axis, -bendAngle));
      color = textureSampleLevel(skyTex, skySampler, deflected, 0.0).rgb;

      // Soft edge fade to the billboard's rim so the earlier-drawn roster
      // shows through once deflection is negligible (Blend.d.ts's 'over').
      let edgeFade = 1.0 - smoothstep(u.lutMaxImpactParamRs * 0.7, u.lutMaxImpactParamRs, impactParamRs);
      alpha = u.bandAlpha * edgeFade;
    }

    let annulus = annulusEmission(rayDir, toAnchor, closestT);
    color += annulus.rgb;
    alpha = max(alpha, u.bandAlpha * annulus.a);
  }

  return vec4<f32>(color * alpha, alpha); // premultiplied, per PREMULTIPLIED_OVER_BLEND
}
