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
// ## Composition (spec §5 + §7.2/§7.3)
//
//   roughness = mix(clamp(mat.r * roughnessBase, MIN_ROUGHNESS, 1), u.oceanRoughness, mat.g)
//   direct    = pbrDirect(n, v, l, albedo, roughness, f0)
//   direct   *= (1 - cloudShadow.a * cloudShadowStrength)  // ground shadow, §7.2
//   colour    = direct * sunIrradiance + ambientLight * albedo
//   emissive  = nightLights(nightColour, NoL, cloud.a)     // ADDED, not lit; §7.3
//   return      colour + emissive
//
// The Black Marble night map contributes an EMISSIVE city-lights term added on
// top of the lit result -- 'lib/nightLights.wesl' owns the terminator fade, so
// the fragment passes the raw Lambert 'NoL' straight in.
//
// ## Cloud coupling (binding 6, spec §7.2/§7.3)
//
// The cloud shell (plan D) couples back onto the surface in two places, both
// sampling the SAME sRGB cloud map (alpha = coverage):
//
//   1. Ground shadow -- a ray from the surface point toward the sun samples cloud
//      coverage where it exits the shell (radius 'u.cloudShellRadius'), and dims
//      the DIRECT sun term by 'coverage * u.cloudShadowStrength'. Multiplying the
//      direct term (not the ambient floor) means the shadow self-limits at the
//      terminator, where 'direct' already tends to zero. See the inline block.
//   2. Night occlusion -- cloud coverage at the fragment's OWN uv is passed as
//      'cloudAlpha' to 'nightLights', dimming city lights under overcast.
//
// Before the cloud bitmap lands the 1x1 transparent placeholder reports alpha 0,
// so both couplings are inert (no shadow, no extra occlusion) -- branch-free.
//
// The material's ocean mask 'mat.g' selects the smooth open-water roughness
// ('u.oceanRoughness', the user-tunable Earth-scoped override of the
// 'OCEAN_ROUGHNESS' const in pbr.wesl) over the land micro-roughness, so the two
// surfaces get one continuous roughness field. 'pbrDirect' is the DIRECT
// (sun-lit) term only; the ambient floor 'u.ambientLight' is added here so the
// night hemisphere never dissolves at the terminator. Unlike every OTHER lit
// body -- which reads the shared 'AMBIENT' const in 'lib/bodyLighting.wesl' --
// Earth reads a per-draw uniform so the value is user-tunable (earthshine /
// moonlight varies); it seeds from the same 0.08 the const holds, so the default
// look is unchanged. The const stays the floor for the flat + textured planets.
// 'sunIrradiance' scales the direct term and is set (in 'earthSurfaceParams.ts')
// to roughly preserve the previous 'litShade' brightness.
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
// ny along +v=north in G; nz is always positive and reconstructed). The shared
// 'lib/normalMap.wesl' 'perturbNormal' owns the TBN maths: it takes 'Ng', the RAW
// interpolated +u (east) tangent, and the encoded RG, then Gram-Schmidt-
// re-orthonormalizes the tangent against 'Ng' (interpolation skews it off
// perpendicular) and rotates the tangent-space vector into local space. Its
// bitangent 'cross(Ng, Tn)' points +v = NORTH -- matching the bake's G axis (see
// bakeNormalMap's row/sign section, the shared contract). The perturbed 'n' feeds
// 'pbrDirect' in place of 'Ng' so relief catches the sun. The flat-normal
// placeholder encodes (0,0,1), so before the real map arrives 'perturbNormal'
// returns 'Ng' unchanged and the shading is identical to the un-perturbed path.
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
import package::lib::nightLights::nightLights;
import package::lib::normalMap::perturbNormal;
import package::lib::util::raySphere;
import package::lib::math::PI;
import package::lib::math::TAU;

@group(0) @binding(0) var<uniform> u: EarthSurfaceUniforms;
@group(0) @binding(1) var earthSampler: sampler;
@group(0) @binding(2) var earthTexture: texture_2d<f32>;
@group(0) @binding(3) var materialTexture: texture_2d<f32>;
@group(0) @binding(4) var nightTexture: texture_2d<f32>;
@group(0) @binding(5) var normalTexture: texture_2d<f32>;
@group(0) @binding(6) var cloudTexture: texture_2d<f32>;

// dirToEquirectUv -- map a unit direction on the sphere to the mesh's
// equirectangular uv, the SAME convention 'cubeSphereMesh' bakes and the cloud
// map's 'flipY:true' upload expects. So a uv computed here from a direction
// samples the identical texel a mesh vertex pointing that way would (used for
// the ground-shadow crossing point, which has no interpolated in.uv to reuse).
//
//   u = east longitude / TAU. 'cubeSphereMesh' puts longitude on +Y, so
//       lon = atan2(dir.y, dir.x) (0 at +X, +pi/2 at +Y) -- exactly the raw u
//       the fragment samples in.uv at (see the '## uv / u-orientation' note).
//       atan2 returns (-pi, pi], so u lands in (-0.5, 0.5]; 'fract' wraps it to
//       [0, 1) -- the same wrap the sampler's 'repeat' addressing applies.
//   v = latitude mapped south (0) to north (1): lat = asin(dir.z) in
//       [-pi/2, pi/2], so v = lat/PI + 0.5 matches the mesh's south-first v
//       (v=0 south pole, v=1 north pole) that flipY:true co-registers with.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

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
  // and ny (G) along +v=north; 'perturbNormal' reconstructs the always-positive
  // nz, builds a per-fragment TBN from Ng + the raw east tangent, and rotates the
  // tangent-space vector into local space. Before the real map lands the
  // placeholder encodes (0,0,1) -> n == Ng, identical to the geometric-normal path.
  let nEnc = textureSample(normalTexture, earthSampler, in.uv).rg; // LINEAR RG
  // Geometric normal (renormalized -- interpolation across a face shortens it).
  let Ng = normalize(in.normalLocal);
  // Perturb Ng by the tangent-space map. 'lib/normalMap.wesl' owns the TBN maths
  // (decode -> reconstruct nz -> Gram-Schmidt the raw east tangent against Ng ->
  // rotate) and the +v=north bitangent sign that pairs with bakeNormalMap.ts.
  let n = perturbNormal(Ng, in.tangent, nEnc); // perturbed shading normal
  // View vector: camera minus surface point, both in the body's local frame.
  // 'normalLocal' doubles as the unit-sphere surface POSITION here, and
  // 'u.camPosLocal' is the camera in that same frame (body-radii units), so their
  // difference is the surface->camera direction.
  let v = normalize(u.camPosLocal - in.normalLocal);
  let l = u.sunDirLocal;

  // Ocean mask selects the smooth open-water roughness ('u.oceanRoughness', the
  // user-tunable Earth-scoped override of pbr.wesl's OCEAN_ROUGHNESS seed) over
  // the land micro-roughness; MIN_ROUGHNESS floors the land side away from the
  // GGX singularity (that const lives in pbr.wesl beside the BRDF that reads it).
  let roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), u.oceanRoughness, mat.g);

  // Direct (sun-lit) microfacet term, scaled by the body's sun irradiance, plus
  // the shared ambient floor.
  let directBase = pbrDirect(n, v, l, albedo, roughness, u.f0);

  // Ground shadow (spec §7.2): cast a ray from the surface point toward the sun
  // and darken the direct term wherever the cloud deck above blocks the sunlight.
  // 'P' is the GEOMETRIC unit-sphere position (renormalized -- interpolation
  // shortens it), NOT the TBN-perturbed shading normal 'n': the shadow is cast
  // from where the point actually SITS, not the direction the relief tilts. 'P'
  // (|P|=1) is INSIDE the shell (radius u.cloudShellRadius ~= 1.002), and 'l' is
  // already unit in the local frame (no invModel scaling -- the house
  // renormalize-after-invModel trap does not apply here), so raySphere's unit-rd
  // precondition holds. With the origin inside the sphere its miss sentinel is
  // unreachable: c = |P|^2 - r^2 < 0, so the 'c>0 && b>0' early-out is false and
  // the discriminant b^2 - c > 0 is always positive -- both roots are real and
  // the exit root roots.y = -b + sqrt(...) > 0 (verified against lib/util.wesl's
  // raySphere), so no miss branch is needed. We sample cloud alpha where the ray
  // exits the shell and dim the direct term by that coverage. Applying this to
  // 'direct' BEFORE the '* sunIrradiance' combine self-limits at the terminator:
  // 'direct' already tends to zero there, so the shadow cannot punch a dark hole
  // into the night side.
  let P = normalize(in.normalLocal);
  let roots = raySphere(P, l, vec3<f32>(0.0), u.cloudShellRadius);
  let crossing = P + roots.y * l;
  let shadowAlpha = textureSample(cloudTexture, earthSampler, dirToEquirectUv(normalize(crossing))).a;
  let direct = directBase * (1.0 - shadowAlpha * u.cloudShadowStrength);

  let colour = direct * u.sunIrradiance + u.ambientLight * albedo;

  // City lights (Black Marble) are EMISSIVE, so 'nightLights' is ADDED to the lit
  // colour, never multiplied through the Lambert term (see 'lib/nightLights.wesl').
  // The night texture is 'rgba8unorm-srgb', so the sample is already linear.
  // 'NoL' is the RAW clamped Lambert term -- 'nightLights' owns the terminator
  // fade, so we must not pre-shape it here. Before the map lands the night
  // texture is a 1x1 black placeholder, so 'emissive' is zero.
  let nightColour = textureSample(nightTexture, earthSampler, in.uv).rgb;
  let NoL = max(dot(n, l), 0.0);
  // Night occlusion (spec §7.3): cloud coverage at this fragment's OWN uv dims
  // the city lights, the way an overcast deck hides them from orbit. Before the
  // cloud map lands the 1x1 transparent placeholder reports alpha 0, so
  // '(1 - cloudAlpha)' inside nightLights is a no-op and the lights show full.
  let cloudAlphaHere = textureSample(cloudTexture, earthSampler, in.uv).a;
  let emissive = nightLights(nightColour, NoL, cloudAlphaHere);
  return vec4<f32>(colour + emissive, 1.0);
}
