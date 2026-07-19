// earth/fragment.wesl — fragment stage for the true-scale textured Earth.
//
// Samples an equirectangular Blue Marble albedo at the mesh uv and a co-registered
// LINEAR material map (roughness in .r, ocean mask in .g), then shades it with the
// shared physically-based microfacet core ('lib/pbr.wesl' 'pbrDirect') under the
// sun-relative light direction so the terminator tracks Earth's real position
// relative to the Sun AND the smooth ocean returns a tight specular glint. The lit
// colour goes straight into the rgba16float foreground colour target. Before the
// real bitmaps arrive the bound textures are 1×1 placeholders -- mid-blue albedo
// and an all-land material (R=1 roughness, G=0 ocean mask) -- so this same path
// draws a plain lit, glint-free blue sphere: visible-but-plain rather than black
// or absent (see 'earthRenderer.ts' header).
//
// ## Composition (spec §5)
//
//   roughness = mix(clamp(mat.r * roughnessBase, MIN_ROUGHNESS, 1), OCEAN_ROUGHNESS, mat.g)
//   direct    = pbrDirect(n, v, l, albedo, roughness, f0)
//   colour    = direct * sunIrradiance + AMBIENT * albedo
//
// The material's ocean mask 'mat.g' selects the smooth open-water roughness
// ('OCEAN_ROUGHNESS' from pbr.wesl) over the land micro-roughness, so the two
// surfaces get one continuous roughness field. 'pbrDirect' is the DIRECT
// (sun-lit) term only; the shared 'AMBIENT' floor ('lib/bodyLighting.wesl') is
// added here so the night hemisphere never dissolves at the terminator -- the
// same single-source-of-truth discipline every lit body follows. 'sunIrradiance'
// scales the direct term and is set (in 'earthSurfaceParams.ts') to roughly
// preserve the previous 'litShade' brightness.
//
// ## Renormalize the interpolated normal
//
// 'normalLocal' arrives interpolated across the triangle face. Linear
// interpolation of two unit vectors yields a SHORTER vector between them, so a
// raw dot with the sun direction would under-report the Lambert term mid-face
// and band the terminator. 'normalize' restores unit length before the dot --
// the standard per-fragment normal fix for smooth-shaded spheres.
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

import package::bodies::earth::io::VSOut;
import package::lib::sphere::EarthSurfaceUniforms;
import package::lib::pbr::pbrDirect;
import package::lib::pbr::MIN_ROUGHNESS;
import package::lib::pbr::OCEAN_ROUGHNESS;
import package::lib::bodyLighting::AMBIENT;

@group(0) @binding(0) var<uniform> u: EarthSurfaceUniforms;
@group(0) @binding(1) var earthSampler: sampler;
@group(0) @binding(2) var earthTexture: texture_2d<f32>;
@group(0) @binding(3) var materialTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Sample the mesh uv directly. With longitude on +Y the equirectangular
  // texture's east already reads to screen-right for an outside viewer, so no u
  // flip is needed; v is likewise raw -- both bitmaps are uploaded flipY:true
  // (see the notes above). The albedo texture is 'rgba8unorm-srgb' (hardware
  // linearises on read); the material texture is LINEAR 'rgba8unorm' so its
  // packed roughness (.r) and ocean mask (.g) are read as raw numbers, not
  // gamma-shifted colour.
  let albedo = textureSample(earthTexture, earthSampler, in.uv).rgb;
  let mat = textureSample(materialTexture, earthSampler, in.uv).rg;

  // Renormalize the interpolated normal (see the header). The view vector is the
  // camera minus the surface point, both in the body's local frame: 'normalLocal'
  // doubles as the unit-sphere surface POSITION here (V is the only term that
  // needs it), and 'u.camPosLocal' is the camera in that same frame (body-radii
  // units), so their difference is the surface->camera direction.
  let n = normalize(in.normalLocal);
  let v = normalize(u.camPosLocal - in.normalLocal);
  let l = u.sunDirLocal;

  // Ocean mask selects the smooth open-water roughness over the land
  // micro-roughness; MIN_ROUGHNESS floors the land side away from the GGX
  // singularity (both constants live in pbr.wesl beside the BRDF that reads them).
  let roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), OCEAN_ROUGHNESS, mat.g);

  // Direct (sun-lit) microfacet term, scaled by the body's sun irradiance, plus
  // the shared ambient floor. 'u.cloudShadowStrength' is bound but UNUSED in plan
  // A -- plan D (the cloud shell) multiplies 'direct' by the cloud-shadow term.
  let direct = pbrDirect(n, v, l, albedo, roughness, u.f0);
  let colour = direct * u.sunIrradiance + AMBIENT * albedo;
  return vec4<f32>(colour, 1.0);
}
