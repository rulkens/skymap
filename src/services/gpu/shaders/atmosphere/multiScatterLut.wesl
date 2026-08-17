// atmosphere/multiScatterLut.wesl — the multiple-scattering LUT bake (compute).
//
// Writes the 32x32 view-INDEPENDENT multi-scatter table: each texel stores the
// isotropic contribution of SECOND-and-higher-order scattering at (sun-zenith
// cosine, altitude). This is Hillaire's key trick — rather than the expensive
// full multi-order march Bruneton precomputes, he approximates all higher
// orders as directionally uniform and sums the infinite bounce series in closed
// form. The sky-view bake adds this table's value to the single-scatter source
// at every march step, which is what keeps the daytime sky from going too dark
// (single scattering alone loses all the light that bounced more than once).
//
// Baked ONCE at startup, AFTER the transmittance LUT (it samples it), in the
// same construction-time encoder (Task 5). It samples the transmittance LUT but
// — critically — NEVER itself: the geometric-series closed form is what stands
// in for the recursion, so there is no self-dependency to barrier against.
//
// ## The algorithm (Hillaire 2020, section 5)
//
// For each texel's (r, sunDir):
//   - Fire 'SQRT_SAMPLES^2' rays uniformly over the sphere of directions.
//   - Along each ray march 'MULTI_SCATTER_STEPS' steps accumulating TWO things:
//       L    — second-order in-scattered radiance, sun light single-scattered
//              toward the eye with the ISOTROPIC phase (higher orders are
//              assumed uniform, so the real Rayleigh/Mie phases drop out here).
//       fms  — the 'multi-scatter-as-1' transfer factor: the fraction of a unit
//              of uniform radiance that gets scattered along this ray. This is
//              the ratio that seeds the geometric series.
//   - Add the ground bounce (Lambertian, groundAlbedo) if the ray hits the
//     surface.
//   - Average both over the sphere of rays (the 4*PI solid angle and the
//     1/(4*PI) isotropic phase cancel, so a plain average is correct).
//   - Sum the infinite series: F = 1 / (1 - fms); psi = L * F. Store psi.
//
// Fixed sample/step counts (named consts) — no adaptive machinery. rgba16float
// storage write; same first-in-repo caveat + render-to-texture fallback as the
// transmittance bake (consumers only SAMPLE this LUT).
//
// Comments single-quoted, never backticks. Literal 'package::' imports.

import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::sampleMedium;
import package::atmosphere::scattering::marchDistance;
import package::atmosphere::scattering::sampleTransmittanceToTop;
import package::atmosphere::scattering::UNIFORM_PHASE;
import package::atmosphere::scattering::EXTINCTION_EPS;
import package::lib::math::PI;

// The LUT dimensions are NOT restated here — they derive from
// 'textureDimensions(outTex)' at dispatch, so the renderer's createTexture size
// ('MULTI_SCATTER_LUT_SIZE') is their single home and cannot drift from a mirror.
// Sphere-of-directions sampling: SQRT_SAMPLES per axis, so SQRT_SAMPLES^2 rays
// (8 -> 64). The march is short (a low-frequency estimate), so a modest step
// count suffices.
const MULTI_SCATTER_SQRT_SAMPLES: u32 = 8u;
const MULTI_SCATTER_STEPS: f32 = 20.0;

@group(0) @binding(0) var<uniform> params: ScatteringParams;
@group(0) @binding(1) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(2) var lutSamp: sampler;
@group(0) @binding(3) var outTex: texture_storage_2d<rgba16float, write>;

// The two accumulators one ray contributes: 'lum' the second-order in-scatter,
// 'fms' the multi-scatter-as-1 transfer factor (both per-channel).
struct RayContribution {
  lum: vec3<f32>,
  fms: vec3<f32>,
};

// integrateRay — march one direction from 'p0' (at radius r) toward the sphere
// boundary, accumulating the second-order in-scatter (isotropic phase) and the
// transfer factor, plus a Lambertian ground bounce if the ray lands on the
// surface. 'sunDir' is the sun in this local frame.
fn integrateRay(p0: vec3<f32>, dir: vec3<f32>, sunDir: vec3<f32>) -> RayContribution {
  let bottom = params.planetRadiusKm;
  let top = params.atmosphereTopKm;
  let tMax = marchDistance(p0, dir, bottom, top);
  let dt = tMax / MULTI_SCATTER_STEPS;

  var lum = vec3<f32>(0.0);
  var fms = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);

  var i: u32 = 0u;
  loop {
    if (f32(i) >= MULTI_SCATTER_STEPS) { break; }
    let t = (f32(i) + 0.5) * dt;
    let pos = p0 + dir * t;
    let r = length(pos);
    let up = pos / r;
    let sunCosZenith = dot(up, sunDir);

    let m = sampleMedium(params, pos);
    let sampleTransmittance = exp(-m.extinction * dt);
    let sunTransmittance = sampleTransmittanceToTop(transmittanceLut, lutSamp, bottom, top, r, sunCosZenith);

    // Total scattering coefficient at this point (Rayleigh + Mie, both
    // per-channel). Higher orders are treated as isotropic, so no phase
    // weighting.
    let scattering = m.scatterR + m.scatterM;

    // Second-order source: sun light reaching this point, scattered with the
    // isotropic phase. Integrated analytically across the step via the standard
    // '(S - S*T) / extinction' closed form (exact for constant coefficients over
    // the short step).
    let s = sunTransmittance * scattering * UNIFORM_PHASE;
    let sInt = (s - s * sampleTransmittance) / max(m.extinction, vec3<f32>(EXTINCTION_EPS));
    lum = lum + throughput * sInt;

    // Transfer factor: same analytic integral of the scattering coefficient
    // alone (the fraction of a unit of uniform radiance re-scattered).
    let msInt = (scattering - scattering * sampleTransmittance) / max(m.extinction, vec3<f32>(EXTINCTION_EPS));
    fms = fms + throughput * msInt;

    throughput = throughput * sampleTransmittance;
    i = i + 1u;
  }

  // Ground bounce: if the ray reached the surface, add the Lambertian reflection
  // of the sunlight that arrives there (isotropic albedo / PI, weighted by the
  // sun incidence and the throughput surviving to the ground).
  let hitPos = p0 + dir * tMax;
  let rGround = length(hitPos);
  if (rGround <= bottom + 1e-3) {
    let up = hitPos / rGround;
    let sunCosZenith = dot(up, sunDir);
    if (sunCosZenith > 0.0) {
      let sunTransmittance = sampleTransmittanceToTop(transmittanceLut, lutSamp, bottom, top, bottom, sunCosZenith);
      lum = lum + throughput * sunTransmittance * sunCosZenith * params.groundAlbedo / PI;
    }
  }

  var out: RayContribution;
  out.lum = lum;
  out.fms = fms;
  return out;
}

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(dims);

  // Invert the linear (sunCosZenith, altitude) mapping to recover this texel's
  // sample point + sun direction.
  let sunCosZenith = uv.x * 2.0 - 1.0;
  let r = mix(params.planetRadiusKm, params.atmosphereTopKm, uv.y);
  let p0 = vec3<f32>(0.0, 0.0, r);
  let sunDir = vec3<f32>(sqrt(max(0.0, 1.0 - sunCosZenith * sunCosZenith)), 0.0, sunCosZenith);

  var lumTotal = vec3<f32>(0.0);
  var fmsTotal = vec3<f32>(0.0);

  // Uniform sphere sampling: azimuth theta from the first index, polar via
  // 'cosPhi = 1 - 2*randB' (equal-area in cos), so the directions are evenly
  // spread over the sphere. The 4*PI solid angle and the 1/(4*PI) isotropic
  // phase cancel, so averaging the per-ray contributions is the correct sphere
  // integral.
  var i: u32 = 0u;
  loop {
    if (i >= MULTI_SCATTER_SQRT_SAMPLES) { break; }
    var j: u32 = 0u;
    loop {
      if (j >= MULTI_SCATTER_SQRT_SAMPLES) { break; }
      let randA = (f32(i) + 0.5) / f32(MULTI_SCATTER_SQRT_SAMPLES);
      let randB = (f32(j) + 0.5) / f32(MULTI_SCATTER_SQRT_SAMPLES);
      let theta = 2.0 * PI * randA;
      let cosPhi = 1.0 - 2.0 * randB;
      let sinPhi = sqrt(max(0.0, 1.0 - cosPhi * cosPhi));
      let dir = vec3<f32>(cos(theta) * sinPhi, sin(theta) * sinPhi, cosPhi);

      let c = integrateRay(p0, dir, sunDir);
      lumTotal = lumTotal + c.lum;
      fmsTotal = fmsTotal + c.fms;
      j = j + 1u;
    }
    i = i + 1u;
  }

  let invCount = 1.0 / f32(MULTI_SCATTER_SQRT_SAMPLES * MULTI_SCATTER_SQRT_SAMPLES);
  let inScatter = lumTotal * invCount;
  let transfer = fmsTotal * invCount;

  // Infinite-bounce geometric series: each bounce re-scatters 'transfer' of the
  // previous, so the total is 1/(1 - transfer) per channel. transfer < 1 for any
  // physical atmosphere, so the denominator stays positive.
  let sumScattering = vec3<f32>(1.0) / max(vec3<f32>(1.0) - transfer, vec3<f32>(EXTINCTION_EPS));
  let psi = inScatter * sumScattering;

  textureStore(outTex, vec2<u32>(gid.x, gid.y), vec4<f32>(psi, 1.0));
}
