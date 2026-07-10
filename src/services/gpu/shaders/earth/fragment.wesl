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
// ## uv / u-orientation (no flip needed)
//
// The raw u reads correctly for an outside viewer. 'uvSphereMesh' now places
// longitude on the +Y axis (equatorial J2000 frame): a vertex at world position
// cosLat*cosLon (x), cosLat*sinLon (y), sinLat (z), with the pole on +Z. Walk
// two equatorial vertices to see where increasing u goes for a viewer OUTSIDE
// the sphere (the camera side, back-face culled):
//
//   u=0.00 -> lon=0    -> dir (+1, 0, 0)  = +X
//   u=0.25 -> lon=pi/2 -> dir ( 0,+1, 0)  = +Y
//
// A camera facing the +X vertex from outside (eye on +X, looking toward the
// origin, up=+Z the north pole) has screen-right = +Y: right x up = back, and
// (+Y) x (+Z) = +X = -forward. So the u=0.25 vertex at +Y lands on the viewer's
// RIGHT. Increasing u (increasing east longitude) therefore moves the surface
// point toward screen-right -- CCW seen from outside. Equirectangular world maps
// are authored with longitude (east) increasing left->right as seen from
// outside, so sampling at the raw u draws the continents in the correct
// orientation. No u remap is needed (the old +Z-longitude basis mirrored east
// to screen-left and required a flip; swapping to +Y longitude removed it).
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
  // Sample the mesh uv directly. With longitude on +Y the equirectangular
  // texture's east already reads to screen-right for an outside viewer, so no u
  // flip is needed; v is likewise raw -- the bitmap is uploaded flipY:true (see
  // the notes above).
  let colour = textureSample(earthTexture, earthSampler, in.uv).rgb;
  return vec4<f32>(colour, 1.0);
}
