// volumeUpsample/fragment.wesl — sample the half-res target with bilinear
// filtering and emit the sample for additive blending into the HDR target.
//
// ## Why this is safe to bilinear-sample
//
// Every scalar-volume field draws into the half-res target with additive
// blending '(one, one)' for color AND alpha (see scalarVolumeRenderer.ts's
// pipeline blend state).  So the half-res target holds the additive sum
// of every field's contribution.  Bilinear sampling reads a weighted
// average of the four nearest half-res texels — mathematically equivalent
// to a low-pass-filtered reconstruction of the original sum.  The scalar-
// field data is bandlimited (3D textures are smooth; the per-fragment
// jitter dither in the raymarcher already covers high-frequency
// aliasing), so the bilinear blur is invisible.
//
// The pipeline blend state ((one, one) for both color and alpha) then
// adds this sampled value to the HDR target — net effect is identical
// to the pre-half-res "draw volumes directly into HDR" path up to the
// bilinear interpolation.
//
// TODO(manual-bilinear): if a future device-feature audit forbids
// 'linear' filtering on rgba16float, replace 'textureSample' with four
// 'textureLoad's at the integer corner texels and a manual lerp.  The
// io.wesl interface and the consumer pipeline don't need to change.

import package::volumeUpsample::io::VSOut;

@group(0) @binding(0) var halfTex: texture_2d<f32>;
@group(0) @binding(1) var halfSamp: sampler;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return textureSample(halfTex, halfSamp, in.uv);
}
