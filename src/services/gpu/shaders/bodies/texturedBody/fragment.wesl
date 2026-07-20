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
// ## Tangent-space relief (normal mapping, binding 4)
//
// The geometric normal 'ng' is perturbed by a tangent-space relief map (binding 4,
// LINEAR RG -- 'bakeNormalMap.ts' stores nx along +u=east in R, ny along +v=north
// in G; nz is always positive and reconstructed) via the shared
// 'lib/normalMap.wesl' 'perturbNormal', so airless bodies like the Moon catch the
// sun on their craters at the terminator. It needs an east tangent 'T', but rather
// than carry a tangent varying (which would touch io.wesl + vertex.wesl) we build
// it in the fragment as 'cross(+z, ng)': the uvSphereMesh pole is +z, so that
// cross is the surface east direction. At the poles ('ng ~ +-z') 'T -> 0', but
// relief vanishes at the poles anyway, so the degeneracy is visually harmless.
// 'perturbNormal' Gram-Schmidt-re-orthonormalizes 'T' against 'ng' before use, so
// the raw cross need not be exactly perpendicular. The perturbed 'n' then feeds
// EVERY downstream lighting term (litShade, the Minnaert noL/noV, the view vector,
// and the ring-shadow solve) in place of 'ng'.
//
// The effect is fully DATA-gated: a body with no 'normal' map binds the shared
// 1x1 flat placeholder '(128,128,255)', which decodes to '(0,0,1)' -- a zero
// perturbation -- so 'perturbNormal' returns 'ng' unchanged and that body shades
// identically to the un-perturbed geometric-normal path. No uniform flag needed.
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
// ## Minnaert limb darkening (view-dependent, multiplicative)
//
// After the Lambert shade and the ring shadow, we fold in a Minnaert limb term
// ('lib/limbDarkening.wesl') so a body's disc dims toward its edge the way a real
// planet's does. Minnaert needs both the incidence cosine 'noL = dot(n, sunDir)'
// -- the same sun cosine Lambert uses -- and the emission cosine 'noV = dot(n, V)'
// toward the viewer. The view vector needs NO new vertex varying: on the unit
// sphere the surface position IS the unit normal 'n', so 'V = camPosLocal - n'
// with the camera already carried in the body's local frame on the uniform
// (packed by 'utils/camera/camPosLocal.ts', body-radii units). Both cosines are
// clamped to 0 so a night-side or beyond-the-limb fragment feeds a non-negative
// base to the law's 'pow'.
//
// The term is DATA-gated: 'u.limbStrength == 0' (every body without a
// 'LIMB_DARKENING_PARAMS' row) makes 'limbDarkening' return 1.0 exactly, so the
// multiply is a shader identity and those bodies render as plain Lambert -- the
// same data-gate the ring branch uses.
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
import package::lib::limbDarkening::limbDarkening;
import package::lib::normalMap::perturbNormal;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
// Ring-alpha strip -- a real 1x1 transparent placeholder on every non-ringed
// body, Saturn's radial ring strip once its bitmap commits. Declared for every
// body so the bind-group layout is identical across all bodies (one pipeline for
// all); sampled only inside the ring-shadow branch, which every ringless body
// short-circuits before it runs.
@group(0) @binding(3) var ringTexture: texture_2d<f32>;
// Tangent-space relief map -- LINEAR 'rgba8unorm' RG slope (see the '## Tangent-
// space relief' header). A real baked map on a body with a 'normal' row (the
// Moon), the shared 1x1 flat placeholder '(128,128,255)' -> '(0,0,1)' on every
// body without one. The placeholder decodes to a zero perturbation, so those
// bodies shade exactly as the un-perturbed geometric-normal path (the data-gate).
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

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
  // Geometric normal (renormalized -- interpolation across a face shortens it).
  let ng = normalize(in.normalLocal);
  // In-shader east tangent: cross(+z pole, ng). The uvSphereMesh pole is +z (its
  // module header: 'z = sin(lat), north pole = +z'), so this cross is the surface
  // east direction (+u). At the poles (ng ~ +-z) T -> 0, but relief vanishes at
  // the poles anyway, so it is visually harmless (guard only if a pole artefact
  // shows). Computing T here avoids a tangent VBO + varying, so io.wesl and
  // vertex.wesl stay unchanged. 'perturbNormal' Gram-Schmidt-re-orthonormalizes T
  // against ng and rebuilds the TBN, so a non-perpendicular T is corrected there.
  let T = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), ng));
  // Perturbed shading normal. The LINEAR RG sample decodes to a tangent-space
  // tilt; the flat placeholder '(0.5,0.5)' decodes to a zero perturbation, so a
  // body with no baked map gets 'n == ng' exactly (the data-gate). Every
  // downstream lighting term below reads this perturbed 'n', not 'ng'.
  let n = perturbNormal(ng, T, textureSample(normalTexture, bodySampler, in.uv).rg);
  let albedo = textureSample(bodyTexture, bodySampler, in.uv).rgb;
  // Ring-on-planet shadow: the body's own ring can occult the sun for this
  // surface point. 'sunVis' is 1.0 when unshadowed (including every ringless
  // body, where 'ringOuterRatio == 0' short-circuits the whole computation).
  // The solve uses the geometric position 'ng' (where the fragment sits on the
  // unit sphere), NOT the perturbed shading normal 'n' -- perturbing the
  // position would skew the ring-plane-crossing solve.
  let sunVis = ringSunVisibility(ng, u.sunDirLocal, u.ringInnerRatio, u.ringOuterRatio);
  // Attenuate ONLY the direct (Lambert) term while the ambient floor rides
  // through untouched: scaling the unit sun direction by the non-negative 'sunVis'
  // scales the Lambert dot by the same factor ('max' preserves a non-negative
  // scale), so 'litShade' stays the single source of the ambient + day/night
  // curve and the shadow just dims the sunlit contribution. Full occlusion
  // ('sunVis == 0') leaves exactly the ambient floor.
  let shade = litShade(n, u.sunDirLocal * sunVis);
  // Minnaert limb darkening: dims the disc toward its edge. 'noL' is the sun
  // cosine (as Lambert), 'noV' the emission cosine toward the viewer. The
  // surface POSITION is 'ng' (the geometric unit-sphere point where the fragment
  // sits), so 'V = camPosLocal - ng'; the emission cosine 'noV = dot(n, V)' then
  // uses the perturbed shading normal 'n'. 'u.limbStrength == 0' (every body
  // without a param row) returns 1.0, so this is a no-op for them.
  let noL = max(dot(n, u.sunDirLocal), 0.0);
  let v = normalize(u.camPosLocal - ng);
  let noV = max(dot(n, v), 0.0);
  let limb = limbDarkening(noL, noV, u.limbStrength, u.limbExponent);
  let colour = albedo * shade * limb;
  return vec4<f32>(colour, 1.0);
}
