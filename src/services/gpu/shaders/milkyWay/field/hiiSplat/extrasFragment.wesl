// hiiSplat/extrasFragment.wesl — the 'hii:extras' pass draws every
// background extra's WHOLE hii mixture concatenated: shells/DIG/young
// interleaved per-instance, deliberately not split by group for segment
// contiguity (createGalaxyModel.ts's repackHiiComponents, ~line 640 — one
// 'hii:extras' span covers each extra's entire own contribution, since a
// per-group split across extras would stop being contiguous). This is the
// ONE fragment that legitimately keeps the data-driven textureWeight sign
// test youngFragment.wesl/erosionFragment.wesl dropped structurally — do
// not "clean it up" into a per-sign split, it would draw the wrong texture
// for whichever group runs second in an extra's own mixture.

import package::milkyWay::field::hiiSplat::io::HiiSplatOut;
import package::milkyWay::field::hiiSplat::shadeCommon::baseHiiShading;
import package::milkyWay::field::hiiSplat::shadeCommon::hiiNearFade;
import package::milkyWay::field::hiiSplat::shadeCommon::quadCapFeather;
import package::milkyWay::field::hiiSplat::shadeCommon::hiiExposureMultiply;
import package::milkyWay::field::hiiSplat::starGrain::starGrainTerm;
import package::milkyWay::field::hiiSplat::hiiNoise::hiiNoiseTerm;
import package::milkyWay::field::dustDetail::ismCartesianUv;
import package::milkyWay::field::dustDetail::ismCartesianTex;
import package::milkyWay::field::dustDetail::ismCartesianSmp;
import package::milkyWay::field::io::u;

@fragment
fn fs(input: HiiSplatOut) -> @location(0) vec4<f32> {
  let shading = baseHiiShading(input);
  if (shading.cut) {
    return vec4<f32>(0.0);
  }

  let a = shading.coeffs.x;
  var emission = shading.emission;

  if (u.dustDetail.y > 0.0 && shading.emissionColorTextureWeight.w != 0.0 && a >= 1e-12) {
    let tPeak = max(-shading.coeffs.y / a, 0.0);
    let p = shading.rayOrigin + shading.rayDir * tPeak;
    let weight = abs(shading.emissionColorTextureWeight.w);
    var term: f32;
    // The SIGN of textureWeight picks which volume this component reads
    // (io.wesl's comps doc): negative is YOUNG STARS, everything else
    // stays on the shared ridged noise.
    if (shading.emissionColorTextureWeight.w < 0.0) {
      term = starGrainTerm(p, tPeak, u.dustDetail.y, u.dustDetail.z);
      let starsWeight = shading.centerStarsWeight.w;
      if (starsWeight > 0.0) {
        let uv = ismCartesianUv(p);
        if (all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0))) {
          let stars = textureSampleLevel(ismCartesianTex, ismCartesianSmp, uv, 0.0).g;
          let shaped = pow(max(stars, 0.0), u.youngStars.x) * u.youngStars.y;
          term = term * mix(1.0, shaped, starsWeight);
        }
      }
    } else {
      term = hiiNoiseTerm(p, u.dustDetail.y, u.dustDetail.z);
    }
    emission = emission * mix(1.0, term, weight);
  }

  let fade = hiiNearFade(shading.po, shading.boundRadius);
  let feather = quadCapFeather(input.corner);
  return vec4<f32>(hiiExposureMultiply(emission * fade * feather), 0.0);
}
