// earth/fragment.wesl — fragment stage for the true-scale textured Earth.
//
// Samples an equirectangular Blue Marble texture at the mesh uv and emits the
// colour straight into the rgba16float foreground colour target. Before the
// real bitmap arrives the bound texture is a 1×1 mid-blue placeholder, so this
// same sample path draws a plain blue sphere -- visible-but-plain rather than
// black or absent (see 'earthRenderer.ts' header).
//
// ## uv / v-orientation
//
// 'uvSphereMesh' emits v south-to-north: v=0 at the south pole, v=1 at the
// north pole. A standard equirectangular Blue Marble image stores the north
// pole in its TOP row. If that bitmap were uploaded unflipped, texture-space
// v=0 would land on the north pole and the globe would render upside-down
// against the mesh's south-first v.
//
// The renderer therefore uploads the bitmap with 'flipY: true', so texture v=0
// is the image's BOTTOM row (south) -- which matches the mesh's v=0 south.
// That lets this shader sample at the RAW mesh uv with no remapping, honouring
// the 'sample without any remapping' contract stated in 'uvSphereMesh's
// docstring. u wraps west-to-east; the sampler uses 'repeat' addressing on u
// so the duplicated seam column blends cleanly.
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float foreground colour target. The
// foreground composite pass uses straight-alpha OVER blending, so we emit
// STRAIGHT colour (not premultiplied) with alpha=1 for fully opaque fragments.
// The texture is 'rgba8unorm-srgb', so the hardware linearises the sample on
// read -- the value handed to us is already linear, correct for the HDR target.

@group(0) @binding(1) var earthSampler: sampler;
@group(0) @binding(2) var earthTexture: texture_2d<f32>;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Raw mesh uv -- the bitmap is uploaded flipY:true so no v-flip is needed
  // here (see the uv/v-orientation note above).
  let colour = textureSample(earthTexture, earthSampler, in.uv).rgb;
  return vec4<f32>(colour, 1.0);
}
