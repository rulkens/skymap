// milkyWay/field/dustAttenuation.wesl — the four-slice dust-column
// attenuation shared by every emission fragment (fieldSplat's primary disc/
// arm/bulge AND every hiiSplat pipeline): each of dustSlices' four depth
// bins attenuates only the tau IN FRONT OF IT, so opacity can reach 100% as
// tau does — a single mean-depth split put a hard 50% floor on obscuration,
// since the dust's own tau centroid sits INSIDE the emitting material from
// both an edge-on and an inside-the-disc view. Moved verbatim from
// splat.wesl's former fs (#78's per-splat-type split); see io.wesl's
// dustSlices doc for the depth-partition derivation.
//
// The tau fetch lives HERE, not with callers: every caller needs the exact
// same 'sample dustMapTex at this fragment's UV, gate on instanceIndex <
// primaryCount' preamble, so folding it into one call keeps every fragment
// file down to 'componentEmission(...)' with no dust-specific knowledge of
// its own to duplicate or drift.

import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::dustMapTex;
import package::milkyWay::field::io::dustMapSmp;

// sliceTransmitRatio — (1 - exp(-x)) / x per channel, the exact closed form
// for emission spread uniformly through a homogeneous slab of optical depth
// x, relative to the slab's near face. x -> 0 is a removable singularity
// (limit 1), but the literal expression is 0/0, so this is guarded per
// channel with select() — red/green/blue can straddle the threshold
// independently. 'safe' only feeds the branch select() discards.
fn sliceTransmitRatio(x: vec3<f32>) -> vec3<f32> {
  let thin = vec3<f32>(1e-4);
  let safe = max(x, thin);
  let ratio = (vec3<f32>(1.0) - exp(-safe)) / safe;
  return select(ratio, vec3<f32>(1.0), x < thin);
}

// componentEmission — one component's dust-attenuated emission integral.
// 'fragPos' is this fragment's framebuffer coordinate (for the dustMapTex
// UV); 'instanceIndex'/'primaryCount' gate attenuation to the PRIMARY
// galaxy's own components (io.wesl's counts.w doc — an extra's emission
// must never darken under the primary's dust); 'coeffs' is this
// component's own gaussianRayCoeffs(); 'amplitude'/'emissionColor' are its
// comps[4i].w/[4i+2].xyz values. Falls back to the plain (no-dust-column)
// integral wherever attenuation doesn't apply, sharing the SAME 'a < 1e-12'
// null-space guard both paths need.
fn componentEmission(
  fragPos: vec2<f32>,
  instanceIndex: u32,
  primaryCount: u32,
  coeffs: vec3<f32>,
  amplitude: f32,
  emissionColor: vec3<f32>,
) -> vec3<f32> {
  let a = coeffs.x;
  var emission = vec3<f32>(0.0);
  var dustApplies = false;

  // dustMapTex is sized to its OWN divisor (io.wesl's DUST MAP doc), not
  // fieldTex's, so this fragment's own coords need counts2.zw (fieldSizePx)
  // to become a normalized UV rather than a direct texel index.
  if (instanceIndex < primaryCount) {
    let dustUv = fragPos / u.counts2.zw;
    let texel = textureSampleLevel(dustMapTex, dustMapSmp, dustUv, 0.0);
    let tau0 = texel.x;
    let tau1 = texel.y;
    let tau2 = texel.z;
    let tau3 = texel.w;
    dustApplies = (tau0 + tau1 + tau2 + tau3) > 1e-6;

    if (dustApplies && a >= 1e-12) {
      let extinctionRgb = u.dustExtinction.xyz;
      // Cumulative optical depth IN FRONT OF each slice: slice 0 sees none
      // of the column yet, slice k sees every slice nearer than it.
      let frontDepth1 = tau0 * extinctionRgb;
      let frontDepth2 = frontDepth1 + tau1 * extinctionRgb;
      let frontDepth3 = frontDepth2 + tau2 * extinctionRgb;

      // tailAtDepth(t) is this Gaussian's own column from depth t to
      // infinity — the same expHalfErfc trick dustMap.wesl uses to slice
      // its dust column, applied here to the EMISSION component instead so
      // each slice's own emission mass (mass_k = tail(t_k) - tail(t_k+1))
      // can be attenuated by that slice's own transmittance before summing.
      let sqrtHalfA = sqrt(2.0 * a);
      let erfcArgAtNear = coeffs.y / sqrtHalfA;
      let erfcArgSlope = a / sqrtHalfA;
      let tailAtDepth0 = expHalfErfc(coeffs.z, erfcArgAtNear);
      let tailAtDepth1 = expHalfErfc(coeffs.z, erfcArgAtNear + erfcArgSlope * u.dustSlices.x);
      let tailAtDepth2 = expHalfErfc(coeffs.z, erfcArgAtNear + erfcArgSlope * u.dustSlices.y);
      let tailAtDepth3 = expHalfErfc(coeffs.z, erfcArgAtNear + erfcArgSlope * u.dustSlices.z);
      // Clamped: two close tail values subtracted can lose precision to the
      // erfc rational approximation's branch seam, and a tiny negative mass
      // would otherwise darken this slice rather than mean "no mass here."
      let sliceMass0 = max(tailAtDepth0 - tailAtDepth1, 0.0);
      let sliceMass1 = max(tailAtDepth1 - tailAtDepth2, 0.0);
      let sliceMass2 = max(tailAtDepth2 - tailAtDepth3, 0.0);
      let sliceMass3 = max(tailAtDepth3, 0.0);

      // Attenuation of emission spread through slice k: exp(-frontDepth_k),
      // the transmittance of everything IN FRONT of the slice, times the
      // in-slice term (sliceTransmitRatio's own header).
      let sliceAtten0 = sliceTransmitRatio(tau0 * extinctionRgb);
      let sliceAtten1 = exp(-frontDepth1) * sliceTransmitRatio(tau1 * extinctionRgb);
      let sliceAtten2 = exp(-frontDepth2) * sliceTransmitRatio(tau2 * extinctionRgb);
      let sliceAtten3 = exp(-frontDepth3) * sliceTransmitRatio(tau3 * extinctionRgb);

      let attenuatedSum = sliceMass0 * sliceAtten0 + sliceMass1 * sliceAtten1
        + sliceMass2 * sliceAtten2 + sliceMass3 * sliceAtten3;
      emission = emissionColor * (amplitude * sqrt(GAUSS_PI / (2.0 * a)) * attenuatedSum);
    }
  }

  // No-dust-column fallback — also covers the null-space 'a < 1e-12' case,
  // which 'emission's zero default already matches.
  if (!dustApplies && a >= 1e-12) {
    emission = emissionColor
      * (amplitude * sqrt(GAUSS_PI / (2.0 * a)) * expHalfErfc(coeffs.z, coeffs.y / sqrt(2.0 * a)));
  }

  return emission;
}
