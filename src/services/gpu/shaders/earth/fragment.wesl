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
// is the image's BOTTOM row (south) -- which matches the mesh's v=0 south. No
// v-remap is needed here.
//
// ## uv / u-orientation (east-west mirror correction)
//
// The u axis, in contrast, DOES need a flip. 'uvSphereMesh' places longitude on
// the +Z axis: a vertex at world position cosLat*cosLon (x), sinLat (y),
// cosLat*sinLon (z). Walk two equatorial vertices to see where increasing u
// goes for a viewer OUTSIDE the sphere (the camera side, back-face culled):
//
//   u=0.00 -> lon=0    -> dir (+1, 0,  0)  = +X
//   u=0.25 -> lon=pi/2 -> dir ( 0, 0, +1)  = +Z
//
// A camera facing the +X vertex from outside (eye on +X, looking toward the
// origin, up=+Y) has screen-right = -Z (since right x up = back: (-Z) x (+Y) =
// +X = -forward). So the u=0.25 vertex at +Z lands on the viewer's LEFT. Thus
// increasing u winds toward screen-left for an outside viewer -- clockwise seen
// from outside. Equirectangular world maps are authored with longitude (east)
// increasing left->right as seen from outside, so sampling at the raw u draws
// the continents east-west mirrored (reads backwards).
//
// Correct it at this single sample site by flipping u to '1.0 - uv.x'. The
// sampler uses 'repeat' addressing on u so the flip (and the duplicated seam
// column) wrap cleanly. NOTE: this means the mesh's 'sample without any
// remapping' contract does not hold for an outside viewer -- see the report
// recommendation; fixed locally here so other mesh consumers keep their uv.
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
  // Flip u ('1.0 - x') to undo the mesh's clockwise-from-outside longitude
  // winding, so the equirectangular texture's east reads to screen-right. v is
  // left raw -- the bitmap is uploaded flipY:true (see the notes above).
  let sampleUv = vec2<f32>(1.0 - in.uv.x, in.uv.y);
  let colour = textureSample(earthTexture, earthSampler, sampleUv).rgb;
  return vec4<f32>(colour, 1.0);
}
