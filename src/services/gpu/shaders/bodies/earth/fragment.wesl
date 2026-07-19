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
//   emissive  = nightLights(nightColour, NoL, 0.0)   // ADDED, not lit (see below)
//   return      colour + emissive
//
// The Black Marble night map contributes an EMISSIVE city-lights term added on
// top of the lit result -- 'lib/nightLights.wesl' owns the terminator fade, so
// the fragment passes the raw Lambert 'NoL' straight in. 'cloudAlpha = 0.0' is
// the plan-D seam (spec §7.3): no cloud map is bound in plan B.
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
// ## Renormalize the interpolated normal + normal mapping
//
// 'normalLocal' arrives interpolated across the triangle face. Linear
// interpolation of two unit vectors yields a SHORTER vector between them, so a
// raw dot with the sun direction would under-report the Lambert term mid-face
// and band the terminator. 'normalize' restores unit length before the dot --
// the standard per-fragment normal fix for smooth-shaded spheres.
//
// The geometric normal 'Ng' is then perturbed by the tangent-space normal map
// (binding 5, LINEAR RG -- 'bakeNormalMap.ts' stores nx along +u=east in R and
// ny along +v=north in G; nz is always positive and reconstructed here). A TBN
// basis is built per-fragment: 'T' is the interpolated +u (east) tangent,
// Gram-Schmidt-re-orthonormalized against 'Ng' (interpolation skews it off
// perpendicular), and the bitangent 'Bt = cross(Ng, T)' points +v = NORTH --
// which matches the bake's G axis (see the inline equator check + bakeNormalMap's
// row/sign section, the shared contract). The perturbed 'n' feeds 'pbrDirect' in
// place of 'Ng' so relief catches the sun. The flat-normal placeholder encodes
// (0,0,1), so before the real map arrives 'n == Ng' and the shading is identical
// to the un-perturbed path.
//
// ## uv / v-orientation
//
// 'cubeSphereMesh' emits v south-to-north: v=0 at the south pole, v=1 at the
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
// The raw u reads correctly for an outside viewer. 'cubeSphereMesh' now places
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
import package::lib::nightLights::nightLights;

@group(0) @binding(0) var<uniform> u: EarthSurfaceUniforms;
@group(0) @binding(1) var earthSampler: sampler;
@group(0) @binding(2) var earthTexture: texture_2d<f32>;
@group(0) @binding(3) var materialTexture: texture_2d<f32>;
@group(0) @binding(4) var nightTexture: texture_2d<f32>;
@group(0) @binding(5) var normalTexture: texture_2d<f32>;

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

  // Tangent-space normal perturbation (see the '## Renormalize the interpolated
  // normal + normal mapping' header). The baked map stores nx (R) along +u=east
  // and ny (G) along +v=north; the shader reconstructs the always-positive nz.
  // We build a per-fragment TBN from the
  // interpolated geometric normal + east tangent, then rotate the tangent-space
  // vector into local space. Before the real map lands the placeholder encodes
  // (0,0,1) -> n == Ng, so the shading is identical to the geometric-normal path.
  let nEnc = textureSample(normalTexture, earthSampler, in.uv).rg; // LINEAR RG
  let nxy = nEnc * 2.0 - 1.0;
  let nz = sqrt(max(0.0, 1.0 - dot(nxy, nxy))); // reconstruct Z (always +)
  // Geometric normal (renormalized -- interpolation across a face shortens it).
  let Ng = normalize(in.normalLocal);
  // Gram-Schmidt: re-orthonormalize the interpolated east tangent against Ng.
  let T = normalize(in.tangent - Ng * dot(Ng, in.tangent));
  // Bitangent = cross(Ng, T) points +v = NORTH, matching the bake's G axis: at
  // the equator (lon=0) Ng=(1,0,0), T=(0,1,0) -> cross=(0,0,1)=celestial north,
  // the direction of increasing latitude. So nxy.y (G, +v=north) rides Bt with
  // the sign the bake encoded (bakeNormalMap's row/sign section is the contract).
  let Bt = cross(Ng, T);
  let n = normalize(T * nxy.x + Bt * nxy.y + Ng * nz); // perturbed shading normal
  // View vector: camera minus surface point, both in the body's local frame.
  // 'normalLocal' doubles as the unit-sphere surface POSITION here, and
  // 'u.camPosLocal' is the camera in that same frame (body-radii units), so their
  // difference is the surface->camera direction.
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

  // City lights (Black Marble) are EMISSIVE, so 'nightLights' is ADDED to the lit
  // colour, never multiplied through the Lambert term (see 'lib/nightLights.wesl').
  // The night texture is 'rgba8unorm-srgb', so the sample is already linear.
  // 'NoL' is the RAW clamped Lambert term -- 'nightLights' owns the terminator
  // fade, so we must not pre-shape it here. Before the map lands the night
  // texture is a 1x1 black placeholder, so 'emissive' is zero.
  let nightColour = textureSample(nightTexture, earthSampler, in.uv).rgb;
  let NoL = max(dot(n, l), 0.0);
  // cloudAlpha = 0.0 is the plan-D seam (spec §7.3): no cloud map is bound in
  // plan B, so '(1 - cloudAlpha)' is a no-op until plan D samples coverage here.
  let emissive = nightLights(nightColour, NoL, 0.0);
  return vec4<f32>(colour + emissive, 1.0);
}
