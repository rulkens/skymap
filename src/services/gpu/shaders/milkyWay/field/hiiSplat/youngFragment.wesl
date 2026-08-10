// hiiSplat/youngFragment.wesl — YOUNG STARS chain fragment: base emission
// times the star-grain texture (starGrain.wesl) ONLY. hiiTiers.ts routes
// only 'young' comps.ts components through this pipeline, so no sign test
// is needed to pick star-grain vs ridged-noise; textureWeight's MAGNITUDE
// (its sign is structural routing, not data this fragment reads) comes
// straight off the comp.

import package::milkyWay::field::hiiSplat::io::HiiSplatOut;
import package::milkyWay::field::hiiSplat::shadeCommon::baseHiiShading;
import package::milkyWay::field::hiiSplat::shadeCommon::hiiNearFade;
import package::milkyWay::field::hiiSplat::shadeCommon::quadCapFeather;
import package::milkyWay::field::hiiSplat::shadeCommon::hiiExposureMultiply;
import package::milkyWay::field::hiiSplat::starGrain::starGrainTerm;
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

  // dustDetail.y (hiiTextureScale) is a live per-frame value, not a
  // pipeline discriminant — it can be 0 on a frame the user dials texture
  // scale down, so this gate stays (io.wesl's dustDetail doc).
  if (u.dustDetail.y > 0.0 && shading.emissionColorTextureWeight.w != 0.0 && a >= 1e-12) {
    let tPeak = max(-shading.coeffs.y / a, 0.0);
    let p = shading.rayOrigin + shading.rayDir * tPeak;
    let weight = abs(shading.emissionColorTextureWeight.w);
    var term = starGrainTerm(p, tPeak, u.dustDetail.y, u.dustDetail.z);

    // starsWeight (comps[4i+3].w) layers the ISM 'stars' tracer read on TOP
    // of the grain term — a young component carries both textures at once.
    let starsWeight = shading.centerStarsWeight.w;
    if (starsWeight > 0.0) {
      let uv = ismCartesianUv(p);
      // A spur's own fadeRadius can run past the ISM grid's rMax
      // (armSpurGeometry.ts's buildSpurRecord), so this keeps an explicit
      // range test rather than trusting the clamp sampler — outside the
      // disc the bake's G is neutral 0, and skipping the test would DARKEN
      // term via mix(1, 0, starsWeight) instead of leaving it untouched.
      if (all(uv >= vec2<f32>(0.0)) && all(uv <= vec2<f32>(1.0))) {
        let stars = textureSampleLevel(ismCartesianTex, ismCartesianSmp, uv, 0.0).g;
        let shaped = pow(max(stars, 0.0), u.youngStars.x) * u.youngStars.y;
        term = term * mix(1.0, shaped, starsWeight);
      }
    }
    emission = emission * mix(1.0, term, weight);
  }

  let fade = hiiNearFade(shading.po, shading.boundRadius);
  let feather = quadCapFeather(input.corner);
  return vec4<f32>(hiiExposureMultiply(emission * fade * feather), 0.0);
}
