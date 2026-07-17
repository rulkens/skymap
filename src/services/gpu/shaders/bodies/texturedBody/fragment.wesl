// texturedBody/fragment.wesl — fragment stage for a textured planet or moon.
//
// Samples the body's equirectangular surface texture at the mesh uv, then
// attenuates it by the shared sun-relative Lambert term ('lib/bodyLighting.wesl'
// 'litShade') so the terminator tracks the body's real position relative to the
// Sun. The lit colour goes straight into the rgba16float foreground target.
// Before the real bitmap arrives the bound texture is a 1x1 mid-grey
// placeholder, so this same path draws a plain lit sphere rather than black or
// absent (see 'texturedBodyRenderer.ts' header).
//
// ## Renormalize the interpolated normal
//
// 'normalLocal' arrives interpolated across the triangle face. Linear
// interpolation of two unit vectors yields a SHORTER vector between them, so a
// raw dot with the sun direction would under-report the Lambert term mid-face
// and band the terminator. 'normalize' restores unit length before the dot --
// the standard per-fragment normal fix for smooth-shaded spheres.
//
// ## Ring-on-planet shadow (analytic, no shadow maps)
//
// A ringed body ('u.ringOuterRatio > 0') casts its ring's shadow onto the
// sphere. Rather than a shadow map, we solve the sun ray against the ring plane
// analytically in the body's LOCAL frame, where the ring plane is the equatorial
// plane z = 0 and the ring radii are already expressed in planet-radius units.
// For a surface point 'p' (the unit-sphere local position) march toward the sun
// 'p + t * sunDirLocal' and solve for the z = 0 crossing: 't = -p.z /
// sunDirLocal.z'. If the crossing is toward the sun ('t > 0') and its in-plane
// radius 'length(hit.xy)' falls inside the annulus '[ringInnerRatio,
// ringOuterRatio]', the ring occults the sun there; we sample the ring strip's
// alpha (its opacity) at that radius and let it block the direct sunlight.
//
// Guards keep the term physical: a sun ray parallel to the ring plane
// ('sunDirLocal.z == 0') never crosses it, and a crossing behind the surface
// point ('t <= 0') is on the far side, so neither casts a shadow. And
// 'ringOuterRatio == 0' -- every non-ringed body -- short-circuits the whole
// computation before any sample, so binding 3's 1x1 transparent placeholder is
// never touched. One pipeline serves ringed and ringless bodies alike: the ring
// is DATA on the uniform, not a Saturn-only shader branch (spec S8).
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float foreground colour target. The
// foreground composite uses straight-alpha OVER blending, so we emit STRAIGHT
// colour with alpha=1 for fully opaque fragments. The body texture is
// 'rgba8unorm-srgb', so the hardware linearises the sample on read -- the value
// is already linear, correct for the HDR target.

import package::bodies::texturedBody::io::VSOut;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::bodyLighting::litShade;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
// Ring-alpha strip -- a real 1x1 transparent placeholder on every non-ringed
// body, Saturn's radial ring strip once its bitmap commits. Declared for every
// body so the bind-group layout is identical across all bodies (one pipeline for
// all); sampled only inside the ring-shadow branch, which every ringless body
// short-circuits before it runs.
@group(0) @binding(3) var ringTexture: texture_2d<f32>;

// Fraction of direct sunlight reaching surface point 'p' after the body's own
// ring passes in front of the sun -- 1.0 when unshadowed. 'p' is the unit-sphere
// local position (also the surface normal); the ring radii are in planet-radius
// units, so the whole solve is unit-free on the local unit sphere. See the module
// header for the derivation.
fn ringSunVisibility(p: vec3<f32>, sunDir: vec3<f32>, innerRatio: f32, outerRatio: f32) -> f32 {
  // No ring on this body -- fully lit. 'ringOuterRatio == 0' is the 'no ring'
  // sentinel, so this exits before any ring sample on every ringless body.
  if (outerRatio <= 0.0) {
    return 1.0;
  }
  // A sun ray parallel to the ring plane never crosses z = 0 -- no shadow.
  if (sunDir.z == 0.0) {
    return 1.0;
  }
  // March from the surface point toward the sun and solve for the z = 0 crossing.
  let t = -p.z / sunDir.z;
  // A crossing at or behind the surface point is on the far side (not between the
  // point and the sun) -- no shadow.
  if (t <= 0.0) {
    return 1.0;
  }
  let hit = p + t * sunDir;
  let r = length(hit.xy); // in-plane radius, planet-radius units
  // The ray misses the annulus -- clear of the ring, fully lit.
  if (r < innerRatio || r > outerRatio) {
    return 1.0;
  }
  // Map the hit radius into the ring strip's [0,1] u coordinate and read its
  // alpha (opacity). The strip is an N x 1 'texture_2d' (never 'texture_1d' --
  // WebKit rejects the 1D sampler and silently drops the whole shared-encoder
  // frame), so v = 0.5 samples the single row's centre. 'textureSampleLevel' (not
  // 'textureSample'): this call sits in non-uniform control flow, where the
  // implicit-LOD sampler's screen-space derivatives are undefined -- an explicit
  // level 0 is both legal there and correct for the mip-less ring strip.
  let uCoord = (r - innerRatio) / (outerRatio - innerRatio);
  let ringAlpha = textureSampleLevel(ringTexture, bodySampler, vec2<f32>(uCoord, 0.5), 0.0).a;
  // Opacity blocks sunlight: visibility is the complement of the ring's alpha.
  return 1.0 - ringAlpha;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normalLocal);
  let albedo = textureSample(bodyTexture, bodySampler, in.uv).rgb;
  // Ring-on-planet shadow: the body's own ring can occult the sun for this
  // surface point. 'sunVis' is 1.0 when unshadowed (including every ringless
  // body, where 'ringOuterRatio == 0' short-circuits the whole computation).
  let sunVis = ringSunVisibility(n, u.sunDirLocal, u.ringInnerRatio, u.ringOuterRatio);
  // Attenuate ONLY the direct (Lambert) term while the ambient floor rides
  // through untouched: scaling the unit sun direction by the non-negative 'sunVis'
  // scales the Lambert dot by the same factor ('max' preserves a non-negative
  // scale), so 'litShade' stays the single source of the ambient + day/night
  // curve and the shadow just dims the sunlit contribution. Full occlusion
  // ('sunVis == 0') leaves exactly the ambient floor.
  let shade = litShade(n, u.sunDirLocal * sunVis);
  let colour = albedo * shade;
  return vec4<f32>(colour, 1.0);
}
