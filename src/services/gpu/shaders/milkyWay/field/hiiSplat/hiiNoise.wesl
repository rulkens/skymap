// hiiSplat/hiiNoise.wesl — the shells/DIG erosion term: reuses dust's own
// baked ridged-noise volume (dustNoiseBake.wesl) so shells/DIG blobs read
// as the same wispy ISM texture their nearby dust already has, rather than
// a second, uncorrelated pattern.

import package::milkyWay::field::io::uniforms;
import package::milkyWay::field::io::dustNoiseTex;
import package::milkyWay::field::io::dustNoiseSmp;

// hiiNoiseTerm — 'scale' multiplies the sampling frequency relative to the
// dust volume's own tile size (uniforms.dustNoise.x); 'contrast' is the same
// signed-power shaping dustMap.wesl's dustNoiseMultiplier applies about the
// noise's own ~0.5 midpoint. Returns a mean-~1 multiplier; the caller mixes
// it against the component's own textureWeight, so weight 0 is exactly
// "untouched" regardless of scale/contrast.
fn hiiNoiseTerm(worldPos: vec3<f32>, scale: f32, contrast: f32) -> f32 {
  let tileUnits = uniforms.dustNoise.x / max(scale, 1e-4);
  let noiseSample = textureSampleLevel(dustNoiseTex, dustNoiseSmp, worldPos / tileUnits, 0.0).x;
  let signedNoise = 2.0 * noiseSample - 1.0;
  let shaped = sign(signedNoise) * pow(abs(signedNoise), contrast);
  return max(0.0, 1.0 + shaped);
}
