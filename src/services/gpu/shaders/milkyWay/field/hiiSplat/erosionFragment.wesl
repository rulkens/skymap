// hiiSplat/erosionFragment.wesl — shells AND DIG share this whole path
// (hiiTiers.ts routes both to the same pipeline): base emission times the
// ridged-noise erosion term (hiiNoise.wesl) ONLY. Same "no sign test"
// removal as youngFragment.wesl — splat.wesl's former shared fs picked this
// branch whenever textureWeight was non-negative, which every shell/DIG
// component always is.

import package::milkyWay::field::hiiSplat::io::HiiSplatOut;
import package::milkyWay::field::hiiSplat::shadeCommon::baseHiiShading;
import package::milkyWay::field::hiiSplat::shadeCommon::hiiNearFade;
import package::milkyWay::field::hiiSplat::shadeCommon::quadCapFeather;
import package::milkyWay::field::hiiSplat::shadeCommon::hiiExposureMultiply;
import package::milkyWay::field::hiiSplat::hiiNoise::hiiNoiseTerm;
import package::milkyWay::field::io::u;

@fragment
fn fs(input: HiiSplatOut) -> @location(0) vec4<f32> {
  let shading = baseHiiShading(input);
  if (shading.cut) {
    return vec4<f32>(0.0);
  }

  let a = shading.coeffs.x;
  var emission = shading.emission;

  // dustDetail.y (hiiTextureScale) is a live per-frame value, not a
  // pipeline discriminant — it can be 0 on a frame the user dials texture
  // scale down, so this gate stays (io.wesl's dustDetail doc).
  if (u.dustDetail.y > 0.0 && shading.emissionColorTextureWeight.w != 0.0 && a >= 1e-12) {
    let tPeak = max(-shading.coeffs.y / a, 0.0);
    let p = shading.rayOrigin + shading.rayDir * tPeak;
    let weight = abs(shading.emissionColorTextureWeight.w);
    let term = hiiNoiseTerm(p, u.dustDetail.y, u.dustDetail.z);
    emission = emission * mix(1.0, term, weight);
  }

  let fade = hiiNearFade(shading.po, shading.boundRadius);
  let feather = quadCapFeather(input.corner);
  return vec4<f32>(hiiExposureMultiply(emission * fade * feather), 0.0);
}
