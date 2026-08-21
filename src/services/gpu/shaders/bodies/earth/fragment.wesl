// earth/fragment.wesl — fragment stage for the true-scale textured Earth.
//
// Samples an equirectangular Blue Marble albedo at the mesh uv and a co-registered
// LINEAR material map (roughness in .r, ocean mask in .g), shaded by the shared
// 'lib/pbr.wesl' 'pbrDirect' microfacet core under the sun-relative light
// direction. Before the real bitmaps arrive the bound textures are 1x1
// placeholders (mid-blue albedo, all-land material), so this same path draws a
// plain lit, glint-free blue sphere rather than black or absent (see
// 'earthRenderer.ts' header). Design background:
// docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md.
//
//   roughness = mix(clamp(mat.r * roughnessBase, MIN_ROUGHNESS, 1), u.oceanRoughness, mat.g)
//   direct    = pbrDirect(n, v, l, albedo, roughness, f0) * (1 - cloudShadow.a * cloudShadowStrength)
//   colour    = direct * sunIrradiance + ambientLight * albedo
//   emissive  = nightLights(nightColour, NoL, cloud.a)   // added, not lit
//   return      colour + emissive
//
// The cloud shell (binding 6) couples back onto the surface in two places, both
// sampling the same sRGB cloud map: a ground-shadow ray toward the sun dims the
// DIRECT term (not the ambient floor, so the shadow self-limits at the
// terminator) where it exits the shell; and the fragment's own cloud alpha dims
// 'nightLights' city-lights under overcast. The 1x1 transparent placeholder
// reports alpha 0 before the bitmap lands, so both couplings are inert.
//
// Earth reads a per-draw 'u.ambientLight' uniform rather than the shared
// 'AMBIENT' const other lit bodies use, so earthshine/moonlight stays
// user-tunable; it seeds from the same 0.08 the const holds.
//
// ## Normal: renormalize before the dot
//
// 'normalLocal' arrives interpolated, which shortens it -- normalize before the
// Lambert dot or the terminator bands. The geometric normal is then perturbed by
// the tangent-space normal map (binding 5) via 'lib/normalMap.wesl' 'perturbNormal';
// its bitangent 'cross(Ng, Tn)' points +v=north, matching 'bakeNormalMap.ts's
// row/sign convention.
//
// ## uv orientation
//
// 'cubeSphereMesh' emits v south-to-north; the renderer uploads Blue Marble with
// 'flipY: true' so texture v=0 matches the mesh's south-first v -- no remap here.
// u needs no remap either: longitude rides +Y in the mesh's J2000 frame, which
// winds CCW as seen from outside and matches an equirectangular map's
// east-increases-left-to-right convention. The mesh bakes u = lon/2pi + 0.5, so
// the prime meridian samples the map's centre u=0.5 where Blue Marble paints
// longitude 0 -- a raw lon/2pi would rotate every continent 180deg about the pole.
//
// ## Tile detail draws over this, in a separate pass
//
// This fragment no longer blends the surface virtual texture itself (the
// page table + atlas bindings and the per-fragment cell lookup that used to
// live here) -- 'earthSurfaceTileRenderer' draws the resolved detail
// patches directly over this base globe, at the same nominal radius, with a
// 'nearer-or-equal' depth compare so ties resolve in ITS favour. This
// fragment always draws the plain whole-globe picture; where no detail
// tile covers a fragment, that picture IS the final one.
//
// ## Blend target
//
// Output @location(0) writes 'rgba16float'; straight-alpha OVER blending means we
// emit STRAIGHT colour with alpha='u.baseGlobeAlpha' (1 outside the descent-fade
// band, where this is visually identical to the old alpha=1 opaque draw). The
// albedo/night textures are 'rgba8unorm-srgb' (hardware linearises on read);
// material/normal are LINEAR.

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

// dirToEquirectUv -- maps a unit direction to the mesh's equirectangular uv (the
// same convention 'cubeSphereMesh' bakes and the flipY:true bitmaps expect), for
// the ground-shadow crossing point, which has no interpolated in.uv to reuse.
// u = east longitude/TAU + 0.5 (the TEXTURE_PRIME_MERIDIAN_U convention, also
// baked into 'cubeSphereMesh.ts' and 'uvSphereMesh.ts' -- WESL can't import the
// TS constant, so it's re-encoded here). v maps latitude south(0)-to-north(1),
// matching the mesh's south-first v.
fn dirToEquirectUv(dir: vec3<f32>) -> vec2<f32> {
  let u_uv = fract(atan2(dir.y, dir.x) / TAU + 0.5);
  let v_uv = asin(clamp(dir.z, -1.0, 1.0)) / PI + 0.5;
  return vec2<f32>(u_uv, v_uv);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Mesh uv sampled directly -- no flip needed (see the header). Albedo is
  // 'rgba8unorm-srgb' (linearised on read); material is LINEAR 'rgba8unorm' so
  // its packed roughness (.r) / ocean mask (.g) read as raw numbers, not colour.
  let albedo = textureSample(earthTexture, earthSampler, in.uv).rgb;
  let mat = textureSample(materialTexture, earthSampler, in.uv).rg;

  // Normal map: baked nx(R)=+u=east, ny(G)=+v=north; 'perturbNormal'
  // reconstructs nz and rotates into local space (see the header). Placeholder
  // encodes (0,0,1) -> n == Ng before the map lands.
  let nEnc = textureSample(normalTexture, earthSampler, in.uv).rg; // LINEAR RG
  let Ng = normalize(in.normalLocal); // renormalized -- interpolation shortens it
  let n = perturbNormal(Ng, in.tangent, nEnc);
  // View vector: 'normalLocal' doubles as the unit-sphere surface position here;
  // 'u.camPosLocal' is the camera in the same local frame.
  let v = normalize(u.camPosLocal - in.normalLocal);
  let l = u.sunDirLocal;

  // Ocean mask selects 'u.oceanRoughness' (Earth-scoped override of pbr.wesl's
  // OCEAN_ROUGHNESS) over land roughness; MIN_ROUGHNESS floors land away from the
  // GGX singularity.
  let roughness = mix(clamp(mat.r * u.roughnessBase, MIN_ROUGHNESS, 1.0), u.oceanRoughness, mat.g);

  let directBase = pbrDirect(n, v, l, albedo, roughness, u.f0);

  // Ground shadow (cloud deck above blocks sunlight): cast a ray from 'P', the
  // GEOMETRIC surface position (not the perturbed shading normal 'n' -- the
  // shadow follows where the point sits, not how relief tilts it), toward the
  // sun. 'P' sits inside the shell (radius ~1.002) and 'l' is already unit in the
  // local frame, so raySphere's unit-rd precondition holds and its miss sentinel
  // is provably unreachable from inside the sphere -- no miss branch needed.
  // Dimming 'direct' BEFORE the sunIrradiance scale self-limits at the
  // terminator, where direct already tends to zero.
  let P = normalize(in.normalLocal);
  let roots = raySphere(P, l, vec3<f32>(0.0), u.cloudShellRadius);
  let crossing = P + roots.y * l;
  let shadowAlpha = textureSample(cloudTexture, earthSampler, dirToEquirectUv(normalize(crossing))).a;
  let direct = directBase * (1.0 - shadowAlpha * u.cloudShadowStrength);

  let colour = direct * u.sunIrradiance + u.ambientLight * albedo;

  // City lights are EMISSIVE -- added to the lit colour, never multiplied through
  // Lambert (see 'lib/nightLights.wesl'). 'NoL' is the RAW clamped term;
  // 'nightLights' owns the terminator fade, so it must not be pre-shaped here.
  let nightColour = textureSample(nightTexture, earthSampler, in.uv).rgb;
  let NoL = max(dot(n, l), 0.0);
  // Cloud coverage at this fragment's own uv dims city lights (overcast hides
  // them from orbit); alpha 0 before the map lands makes this a no-op.
  let cloudAlphaHere = textureSample(cloudTexture, earthSampler, in.uv).a;
  let emissive = nightLights(nightColour, NoL, cloudAlphaHere);

  return vec4<f32>(colour + emissive, u.baseGlobeAlpha);
}
