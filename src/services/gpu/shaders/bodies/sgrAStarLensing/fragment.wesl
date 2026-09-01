// bodies/sgrAStarLensing/fragment.wesl — Schwarzschild ray classification:
// capture (black), escape (LUT-deflected sky-cubemap sample), or annulus
// (bounded emission march), composited over the escape/capture base.
//
// 'Infinity' encoding (Task 9's 'SchwarzschildDeflectionLut.samples', decided
// here per Task 13's brief): the renderer's texture-upload helper
// ('sgrAStarLensingRenderer.ts') replaces every 'Infinity' sample with a
// large finite sentinel before uploading to the r32float texture — raw IEEE
// Infinity round-trips through an r32float texel exactly, but a fast-math
// shader compiler is not guaranteed to preserve Infinity arithmetic
// (this codebase already treats float edge-case flushing as a live
// landmine), so a threshold comparison well below the sentinel and well
// above any real quadrature result is the robust encoding either way — see
// 'CAPTURE_THRESHOLD_RAD' below.
//
// The captured/escape split happens IN THE LUT sample itself (samples with
// impact parameter at or below the photon-sphere bound are Infinity, hence
// sentinel, by construction — see buildSchwarzschildDeflectionLut.ts), so
// 'captured' here means 'the sampled bend angle is the sentinel', not a
// separate geometric test.

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

// Half of the renderer's CPU-side sentinel (see the module header) — the two
// sides don't need to agree on an exact value, only that this sits well
// below the sentinel and well above any real (finite) quadrature result,
// which stays a low-two-digit-radian value even one grid step from the
// critical impact parameter (see buildSchwarzschildDeflectionLut.ts's
// Simpson integration).
const CAPTURE_THRESHOLD_RAD: f32 = 500.0;

const MARCH_STEPS: i32 = 48; // within the spec's 32-64-step bound
const DISK_HALF_THICKNESS_RS: f32 = 0.15; // thin-disk approximation, tuned for looks
const DOPPLER_STRENGTH: f32 = 0.6; // tuned for looks — see BLACK_HOLES's own "visual taste" note

// Two-tap manual lerp over the LUT (an r32float texture is not
// sampler-filterable without the optional 'float32-filterable' feature, so
// this uses textureLoad, not textureSample — see the WebKit texture_1d note
// in docs/RENDERER.md, the reason the LUT is a texture_2d<f32> of height 1
// rather than a texture_1d in the first place). Either tap reading the
// sentinel propagates it through unblended, so a lerp never averages a real
// angle with the capture sentinel into a bogus finite value.
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

// Disk-plane normal from (inclination, positionAngle): tilt a fixed world-+Y
// reference about world +X, then spin the tilted normal's azimuth about
// world +Y. Deliberately NOT the Galactic-Centre sky frame 'sStar.ts' orients
// S-star orbits against — that frame's RA/Dec basis has no field in this
// uniform's locked 144 bytes, and 'BLACK_HOLES''s own doc already calls
// inclination/positionAngle "visual taste" rather than fit to observations —
// so a fixed world reference is a documented simplification, not a silent
// mismatch with the S-star orbits' frame.
fn diskNormal() -> vec3<f32> {
  let tilted = rotateAroundAxis(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), u.inclinationRad);
  return normalize(rotateAroundAxis(tilted, vec3<f32>(0.0, 1.0, 0.0), u.positionAngleRad));
}

// Bounded march along the UNDEFLECTED ray (spec's 32-64-step bound) for the
// accretion annulus's own emission, composited over the escape/capture base
// the caller already resolved. Returns (premultiplied-ish linear emission,
// coverage) — coverage feeds the caller's alpha, not the light itself.
fn annulusEmission(rayDir: vec3<f32>, toAnchor: vec3<f32>) -> vec4<f32> {
  let normal = diskNormal();
  let marchMaxM = u.outerRs * u.schwarzschildRadiusM * 3.0;
  let stepLenM = marchMaxM / f32(MARCH_STEPS);
  let halfThicknessM = DISK_HALF_THICKNESS_RS * u.schwarzschildRadiusM;

  var emission = vec3<f32>(0.0);
  var coverage = 0.0;
  for (var i = 0; i < MARCH_STEPS; i++) {
    let t = (f32(i) + 0.5) * stepLenM;
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
    // Kepler orbital period ~ r^1.5: a cheap differential-rotation phase
    // offset per radius (closer annuli lead the outer ones), not a fitted
    // light curve — visual taste, as above.
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
  // Perpendicular distance from the hole's centre to the ray through the
  // origin (the camera) — the impact parameter. Clamped to the ray's
  // forward half: the billboard is centred on the anchor and faces the
  // camera, so a negative closestT is unreachable in practice, but the
  // clamp keeps the geometry well-defined if float error ever puts a
  // corner fragment just behind the plane's own centre.
  let closestT = max(dot(toAnchor, rayDir), 0.0);
  let offsetVec = toAnchor - rayDir * closestT;
  let impactParamM = length(offsetVec);
  let impactParamRs = impactParamM / u.schwarzschildRadiusM;

  var color = vec3<f32>(0.0);
  var alpha = 0.0;

  if (impactParamRs < u.lutMinImpactParamRs) {
    // Below the LUT's own sampled domain — deep inside the capture region
    // the LUT never samples a finite value for.
    alpha = u.bandAlpha;
  } else {
    let bendAngle = sampleLut(impactParamRs);
    if (bendAngle >= CAPTURE_THRESHOLD_RAD) {
      alpha = u.bandAlpha;
    } else {
      // Gravitational lensing displaces the apparent background AWAY from
      // the lens centre (the Einstein-ring displacement) — rotate the
      // straight-line ray away from the hole by the LUT's bend angle to
      // recover the asymptotic sky direction this photon actually left
      // from. Sign/axis convention: verify visually at the Task 17 gate
      // (the known LUT approximation the brief accepts); flip the sign here
      // if the ring reads backward.
      let axis = normalize(cross(rayDir, toAnchor));
      let deflected = normalize(rotateAroundAxis(rayDir, axis, -bendAngle));
      color = textureSampleLevel(skyTex, skySampler, deflected, 0.0).rgb;

      // Soft edge fade toward the billboard's rim so the roster drawn
      // earlier still shows through once deflection is negligible — 'over'
      // blend, per-pixel alpha does the rest (see ContentLayer.d.ts's note
      // on this row's blend).
      let edgeFade = 1.0 - smoothstep(u.lutMaxImpactParamRs * 0.7, u.lutMaxImpactParamRs, impactParamRs);
      alpha = u.bandAlpha * edgeFade;
    }

    let annulus = annulusEmission(rayDir, toAnchor);
    color += annulus.rgb;
    alpha = max(alpha, u.bandAlpha * annulus.a);
  }

  // Premultiplied — this row's blend is PREMULTIPLIED_OVER (Blend.d.ts's
  // 'over'), so the fragment multiplies its own colour by coverage.
  return vec4<f32>(color * alpha, alpha);
}
