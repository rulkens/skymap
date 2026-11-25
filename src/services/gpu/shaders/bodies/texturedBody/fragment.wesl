// texturedBody/fragment.wesl — fragment stage for a textured planet or moon:
// the lit albedo, the normal-mapped relief, Saturn's ring shadow and the
// Minnaert limb term, over a RAY-TRACED sphere.
//
// The rasterised triangles belong to a circumscribing proxy shell, not to the
// body. Every fragment casts a ray from the camera through its own proxy
// position, intersects the analytic unit sphere, and derives the surface point,
// the normal, the uv and the depth from that hit -- so the silhouette is a
// pixel-exact circle rather than a 48-gon, and the normal is exact rather than a
// barycentric blend.
//
// The sphere maths itself lives in 'lib/analyticSphere.wesl' -- the hit and its
// grazing fallback, the equirectangular uv convention, the wrap-safe gradient
// pair, and why the depth carries no reversed-Z flip are all explained there.
// This module supplies the ray and the shading.
//
// ## The ray, and why the direction is normalized AFTER interpolation
//
// 'uniforms.camPosLocal' is the camera in the body's local frame in body radii (the
// same vector the Minnaert term already needs), so it is the ray origin with no
// extra uniform. 'in.localPos' is the interpolated point on the PROXY shell --
// scaled up by 'PROXY_SCALE', so it is NOT a unit vector and its interpolant is
// not unit length either. 'normalize' has to run on the DIFFERENCE, per
// fragment, after interpolation; skipping it silently breaks every dot product
// downstream (the house 'renormalize after a scaled model transform' trap).
//
// ## Oblateness is free -- because it is baked into the model matrix
//
// 'composeBodyMvp' folds a body's flattening into a non-uniform model Z scale,
// so in the LOCAL frame this shader works in, every body is the unit sphere.
// Ray-vs-unit-sphere therefore serves an oblate body with no ellipsoid maths,
// provided the ray ORIGIN lands in that same frame -- which is what
// 'camPosLocal's oblateness parameter is for. Every textured body passes
// oblateness 0 today (only scene STARS carry it), so the correction is inert
// here and load-bearing for the sphere pick.
//
// ## Where the derivatives are taken
//
// 'dpdx'/'dpdy' need UNIFORM control flow, so the uv gradients are taken before
// the 'discard' and the missed lanes ride along until then on the lib's grazing
// fallback. Both texture reads (surface + normal map) share the one corrected
// gradient pair, since both sample the same uv.

import package::bodies::texturedBody::io::TexturedBodyVSOut;
import package::lib::analyticSphere::equirectUvFromDir;
import package::lib::analyticSphere::equirectUvGradients;
import package::lib::analyticSphere::fragDepthFromClip;
import package::lib::analyticSphere::hitUnitSphere;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::bodyLighting::AMBIENT;
import package::lib::bodyLighting::bodyDirectShade;
import package::lib::surfaceLight::composeSurfaceLight;
import package::lib::limbDarkening::limbDarkening;
import package::lib::normalMap::perturbNormal;
import package::lib::horizonLookup::horizonSunVisibility;
import package::lib::horizonLookup::horizonSkyVisibility;
import package::lib::horizonLookup::localSunAngles;

@group(0) @binding(0) var<uniform> uniforms: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
@group(0) @binding(3) var ringTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;
// The whole-globe horizon map (or its lit 1 × 1 placeholder), read by 'lib/horizonLookup.wesl'.
@group(0) @binding(5) var horizonTexture: texture_2d<f32>;

// Colour + analytic depth. No '@builtin(position)' anywhere in this struct --
// the entry point's position comes in through 'TexturedBodyVSOut', and a second
// position-bearing struct in one linked module is rejected at
// 'createShaderModule' having passed both the build and the WESL linker.
struct FSOut {
  @location(0) colour: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

// The ring-on-planet half of the ring system: how much of the sun a point on
// this body still sees through Saturn's rings. Its twin -- the planet's shadow
// cast onto the ring -- lives in 'ring/fragment.wesl'. Local rather than in a
// lib because it is the only copy and the ring pair's two halves share no maths.
fn ringSunVisibility(surfacePoint: vec3<f32>, sunDir: vec3<f32>, innerRatio: f32, outerRatio: f32) -> f32 {
  if (outerRatio <= 0.0) {
    return 1.0;
  }
  if (sunDir.z == 0.0) {
    return 1.0;
  }
  let distanceToRingPlane = -surfacePoint.z / sunDir.z;
  if (distanceToRingPlane <= 0.0) {
    return 1.0;
  }
  let hit = surfacePoint + distanceToRingPlane * sunDir;
  let ringRadius = length(hit.xy);
  if (ringRadius < innerRatio || ringRadius > outerRatio) {
    return 1.0;
  }
  let uCoord = (ringRadius - innerRatio) / (outerRatio - innerRatio);
  let ringAlpha = textureSampleLevel(ringTexture, bodySampler, vec2<f32>(uCoord, 0.5), 0.0).a;
  return 1.0 - ringAlpha;
}

@fragment
fn fs(in: TexturedBodyVSOut) -> FSOut {
  // ── The ray ───────────────────────────────────────────────────────────────
  let rayOrigin = uniforms.camPosLocal;
  // Renormalize AFTER interpolation: 'in.localPos' rides the 'PROXY_SCALE'-scaled
  // proxy, so neither it nor its interpolant is unit length.
  let rayDir = normalize(in.localPos - rayOrigin);

  // 'uniforms.camAltitudeSq' is f64-derived -- see 'lib/analyticSphere.wesl's depth section.
  let surface = hitUnitSphere(rayOrigin, rayDir, uniforms.camAltitudeSq);
  // Unit length in both branches, so it is the exact geometric normal.
  let surfaceNormal = surface.point;

  // ── Analytic equirectangular uv + wrap-corrected gradients ────────────────
  let uv = equirectUvFromDir(surfaceNormal);
  let grad = equirectUvGradients(uv);

  // Every derivative is now taken; from here the missed lanes contribute
  // nothing, so this is the first legal place to drop them.
  if (!surface.hit) {
    discard;
  }

  // ── Shading ───────────────────────────────────────────────────────────────
  let eastTangent = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), surfaceNormal));
  let shadingNormal = perturbNormal(surfaceNormal, eastTangent, textureSampleGrad(normalTexture, bodySampler, uv, grad.ddx, grad.ddy).rg);
  let albedo = textureSampleGrad(bodyTexture, bodySampler, uv, grad.ddx, grad.ddy).rgb;
  // The horizon map's posts run from −180° and from the north pole: the tiles' scheme, so
  // globe and tiles read the same values at the hand-off. A zero rect (no map) reads lit.
  let horizonUv = vec2<f32>(fract(uv.x), 1.0 - uv.y);
  let sunAngles = localSunAngles(surfaceNormal, uniforms.sunDirLocal);
  let sunVis = ringSunVisibility(surfaceNormal, uniforms.sunDirLocal, uniforms.ringInnerRatio, uniforms.ringOuterRatio)
    * horizonSunVisibility(horizonTexture, uniforms.horizonRect, horizonUv, sunAngles.x, sunAngles.y, uniforms.sunAngularRadiusRad);
  let noL = max(dot(shadingNormal, uniforms.sunDirLocal), 0.0);
  // 'surfaceNormal - rayOrigin = rayDir * t' exactly, so 'viewDir = -rayDir' -- no re-subtract, no renormalize.
  let viewDir = -rayDir;
  let noV = max(dot(shadingNormal, viewDir), 0.0);
  let limb = limbDarkening(noL, noV, uniforms.limbStrength, uniforms.limbExponent);
  let colour = composeSurfaceLight(
    albedo * bodyDirectShade(shadingNormal, uniforms.sunDirLocal) * limb,
    albedo * AMBIENT * limb,
    sunVis,
    horizonSkyVisibility(horizonTexture, uniforms.horizonRect, horizonUv),
  );

  var out: FSOut;
  out.colour = vec4<f32>(colour, 1.0);
  // Eye-relative frame: the hit relative to the eye, through the
  // translation-free 'uniforms.vpCamRelLocal' -- see 'lib/analyticSphere.wesl's depth
  // section.
  out.depth = fragDepthFromClip(uniforms.vpCamRelLocal, rayDir * surface.t);
  return out;
}
