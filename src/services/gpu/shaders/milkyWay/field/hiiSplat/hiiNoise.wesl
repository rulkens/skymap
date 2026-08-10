// hiiSplat/hiiNoise.wesl — the shells/DIG erosion term: reuses dust's own
// baked ridged-noise volume (dustNoiseBake.wesl) so shells/DIG blobs read
// as the same wispy ISM texture their nearby dust already has, rather than
// a second, uncorrelated pattern. Moved verbatim from splat.wesl (the
// per-splat-type split).

import package::milkyWay::field::io::u;
import package::milkyWay::field::io::dustNoiseTex;
import package::milkyWay::field::io::dustNoiseSmp;

// hiiNoiseTerm — 'scale' multiplies the sampling frequency relative to the
// dust volume's own tile size (u.dustNoise.x); 'contrast' is the same
// signed-power shaping dustMap.wesl's dustNoiseMultiplier applies about the
// noise's own ~0.5 midpoint. Returns a mean-~1 multiplier; the caller mixes
// it against the component's own textureWeight, so weight 0 is exactly
// "untouched" regardless of scale/contrast.
fn hiiNoiseTerm(p: vec3<f32>, scale: f32, contrast: f32) -> f32 {
  let tileUnits = u.dustNoise.x / max(scale, 1e-4);
  let n = textureSampleLevel(dustNoiseTex, dustNoiseSmp, p / tileUnits, 0.0).x;
  let s = 2.0 * n - 1.0;
  let shaped = sign(s) * pow(abs(s), contrast);
  return max(0.0, 1.0 + shaped);
}
