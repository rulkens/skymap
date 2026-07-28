// texturedBody/impostorFragment.wesl — fragment stage for the SPIKE analytic
// ray-traced sphere ('?impostor'). Same lighting, ring shadow and Minnaert limb
// term as 'fragment.wesl'; the ONLY difference is where the surface point, the
// normal, the uv and the depth come from.
//
// Mesh path: the rasteriser interpolates a 48x24 polygon's vertex attributes, so
// the silhouette is a 48-gon and the normal is a barycentric blend.
// Impostor path: every fragment casts a ray from the camera through its own
// proxy position, intersects the analytic unit sphere, and derives everything
// from that hit. The silhouette becomes pixel-exact and the normal exact.
//
// ## The ray, and why the direction is normalized AFTER interpolation
//
// 'u.camPosLocal' is the camera in the body's local frame in body radii (the
// same vector the Minnaert term already needs), so it is the ray origin with no
// extra uniform. 'in.localPos' is the interpolated point on the PROXY shell --
// scaled up by 1.05, so it is NOT a unit vector and its interpolant is not unit
// length either. 'normalize' has to run on the DIFFERENCE, per fragment, after
// interpolation; skipping it silently breaks every dot product downstream (the
// house 'renormalize after a scaled model transform' trap).
//
// ## Oblateness is free -- because it is baked into the model matrix
//
// 'composeBodyMvp' folds a body's flattening into a non-uniform model Z scale,
// so in the LOCAL frame this shader works in, every body is the unit sphere.
// Ray-vs-unit-sphere therefore serves an oblate body with no ellipsoid maths.
// CAVEAT, and it is load-bearing: 'camPosLocal' divides the world offset by the
// EQUATORIAL radius on all three axes, so for a body with non-zero oblateness
// the ray origin lands in a frame where the body is a spheroid, not the unit
// sphere. Every textured body passes oblateness 0 today (only scene STARS carry
// it), so the two frames coincide -- but a textured body that ever gains
// flattening needs 'camPosLocal.z' divided by '(1 - oblateness)' as well.
//
// ## Analytic equirectangular uv, and the derivative seam
//
// The uv is rebuilt from the hit direction in exactly the convention
// 'uvSphereMesh' bakes into its vertices:
//
//   x = cos(lat)cos(lon), y = cos(lat)sin(lon), z = sin(lat)
//   u = lon / TAU + TEXTURE_PRIME_MERIDIAN_U    (the 0.5 map-centre offset)
//   v = lat / PI + 0.5                          (south 0 -> north 1)
//
// 'atan2' returns (-PI, PI], so the raw u lands in (0, 1] rather than the mesh's
// [0.5, 1.5). Those differ by exactly one whole turn on the far hemisphere and
// the sampler addresses u as 'repeat', so the SAMPLED TEXEL is identical -- the
// wrap is the hardware's job, and no extra branch is needed to reproduce the
// mesh's unwrapped range.
//
// What is NOT free is the derivative. Per-fragment u jumps by 1.0 across the
// antimeridian, so a 2x2 quad straddling that meridian sees 'dpdx(u) ~ 1', asks
// for a footprint an entire texture wide, and 'textureSample' picks the coarsest
// mip -- a bright blurred one-pixel line down the body. The mesh path never had
// this because its vertex u is monotonic across the whole sphere.
//
// The fix here is 'textureSampleGrad' with WRAP-CORRECTED gradients. We build a
// SECOND u shifted half a turn ('fract(u + 0.5)'), whose own discontinuity sits
// on the prime meridian -- half a sphere away from the first. Any quad small
// enough to matter straddles at most one of the two, so per axis we take
// whichever of the two derivatives has the smaller magnitude: on the seam that
// discards the spurious ~1.0 jump and keeps the honest one; everywhere else the
// two are equal and the choice is a no-op. Both texture reads (surface + normal
// map) use the same corrected gradient pair, since both sample the same uv.
//
// 'dpdx'/'dpdy' require UNIFORM control flow, so they run before any 'discard'.
// That in turn means the missed lanes of a limb quad must still produce a
// PLAUSIBLE uv or they poison their neighbours' gradients. Hence the grazing
// fallback below: a ray that misses is clamped to its closest-approach point and
// normalized onto the sphere, which is C0-continuous with the true hit as the
// limb is crossed, so limb-quad gradients stay finite.
//
// ## Depth
//
// Writing '@builtin(frag_depth)' is mandatory: the rasteriser's interpolated
// depth belongs to the PROXY (1.05x radius, far hemisphere), which is nowhere
// near the surface, so leaving it alone would put every body behind everything
// else. We project the analytic hit through the SAME 'u.mvp' the vertex stage
// uses and emit 'clip.z / clip.w' -- byte-for-byte what the rasteriser would
// have produced had it drawn the true surface, on either depth convention.
// NEAR0 is reversed-Z ('SLAB_REVERSED_Z[NEAR0] = true': infinite far, clear 0,
// 'depthCompare: greater'), and reversed-Z lives entirely inside the projection
// matrix -- clip.z/clip.w already comes out in [0, 1] with 1 at the near plane.
// So there is NO flip to apply here, and this expression stays correct if the
// slab's convention is ever switched. Emitting '1 - z' or reading the flag would
// be the bug.
//
// Two consequences worth knowing: writing frag_depth disables early-Z for this
// pipeline, and a hit nearer than the near plane is CLAMPED to 1.0 rather than
// clipped away (the vertex-stage near clip no longer governs what we shade).

import package::bodies::texturedBody::impostorIo::ImpostorVSOut;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::bodyLighting::litShade;
import package::lib::limbDarkening::limbDarkening;
import package::lib::normalMap::perturbNormal;
import package::lib::util::raySphere;
import package::lib::math::PI;
import package::lib::math::TAU;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
@group(0) @binding(3) var ringTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

// The equirectangular map-centre registration offset. WESL cannot import the TS
// 'TEXTURE_PRIME_MERIDIAN_U', so the 0.5 is re-encoded here -- the same
// greppable-not-importable arrangement 'earth/fragment.wesl' documents.
const TEXTURE_PRIME_MERIDIAN_U: f32 = 0.5;

// Colour + analytic depth. No '@builtin(position)' anywhere in this struct --
// the entry point's position comes in through 'ImpostorVSOut'.
struct FSOut {
  @location(0) colour: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

// Verbatim twin of 'fragment.wesl's ringSunVisibility. Duplicated rather than
// lifted into a lib because this whole module is a throwaway A/B variant; if the
// impostor path is adopted, the mesh fragment goes away and this becomes the
// only copy.
fn ringSunVisibility(p: vec3<f32>, sunDir: vec3<f32>, innerRatio: f32, outerRatio: f32) -> f32 {
  if (outerRatio <= 0.0) {
    return 1.0;
  }
  if (sunDir.z == 0.0) {
    return 1.0;
  }
  let t = -p.z / sunDir.z;
  if (t <= 0.0) {
    return 1.0;
  }
  let hit = p + t * sunDir;
  let r = length(hit.xy);
  if (r < innerRatio || r > outerRatio) {
    return 1.0;
  }
  let uCoord = (r - innerRatio) / (outerRatio - innerRatio);
  let ringAlpha = textureSampleLevel(ringTexture, bodySampler, vec2<f32>(uCoord, 0.5), 0.0).a;
  return 1.0 - ringAlpha;
}

@fragment
fn fs(in: ImpostorVSOut) -> FSOut {
  // ── The ray ───────────────────────────────────────────────────────────────
  let ro = u.camPosLocal;
  // Renormalize AFTER interpolation: 'in.localPos' rides a 1.05-scaled proxy.
  let rd = normalize(in.localPos - ro);

  let roots = raySphere(ro, rd, vec3<f32>(0.0, 0.0, 0.0), 1.0);
  // 'raySphere' returns vec2(-1, -1) on a miss, so a positive exit root is the
  // hit test. Take the NEAR positive root: the entry point when the camera is
  // outside the body, the exit point in the degenerate camera-inside case.
  let didHit = roots.y > 0.0;
  let tSurface = select(roots.y, roots.x, roots.x > 0.0);
  // Grazing fallback for the missed lanes of a limb quad (see the header): the
  // closest-approach parameter, whose point normalizes onto the limb tangent.
  // C0-continuous across the silhouette, so derivatives there stay finite.
  let tGraze = max(dot(-ro, rd), 0.0);
  let t = select(tGraze, tSurface, didHit);
  // 'normalize' does double duty: it is the exact geometric normal for a real
  // hit, and it projects the grazing fallback onto the sphere for a miss.
  let ng = normalize(ro + rd * t);

  // ── Analytic equirectangular uv + wrap-corrected gradients ────────────────
  let lat = asin(clamp(ng.z, -1.0, 1.0));
  let lon = atan2(ng.y, ng.x); // (-PI, PI]
  let uRaw = lon / TAU + TEXTURE_PRIME_MERIDIAN_U; // (0, 1]
  let vCoord = lat / PI + 0.5;

  // Two u parameterisations half a turn apart, so their seams cannot coincide.
  let uSeamAnti = fract(uRaw);
  let uSeamPrime = fract(uRaw + 0.5);
  let dAntiDx = dpdx(uSeamAnti);
  let dAntiDy = dpdy(uSeamAnti);
  let dPrimeDx = dpdx(uSeamPrime);
  let dPrimeDy = dpdy(uSeamPrime);
  // Per axis, keep the smaller-magnitude derivative: the seam-straddling one
  // carries a spurious whole-turn jump, the other carries the true footprint.
  let dudx = select(dPrimeDx, dAntiDx, abs(dAntiDx) < abs(dPrimeDx));
  let dudy = select(dPrimeDy, dAntiDy, abs(dAntiDy) < abs(dPrimeDy));
  let ddx = vec2<f32>(dudx, dpdx(vCoord));
  let ddy = vec2<f32>(dudy, dpdy(vCoord));
  let uv = vec2<f32>(uRaw, vCoord);

  // Every derivative is now taken; from here the missed lanes contribute
  // nothing, so this is the first legal place to drop them.
  if (!didHit) {
    discard;
  }

  // ── Shading (identical to the mesh path from here down) ───────────────────
  let T = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), ng));
  let n = perturbNormal(ng, T, textureSampleGrad(normalTexture, bodySampler, uv, ddx, ddy).rg);
  let albedo = textureSampleGrad(bodyTexture, bodySampler, uv, ddx, ddy).rgb;
  let sunVis = ringSunVisibility(ng, u.sunDirLocal, u.ringInnerRatio, u.ringOuterRatio);
  let shade = litShade(n, u.sunDirLocal * sunVis);
  let noL = max(dot(n, u.sunDirLocal), 0.0);
  let v = normalize(u.camPosLocal - ng);
  let noV = max(dot(n, v), 0.0);
  let limb = limbDarkening(noL, noV, u.limbStrength, u.limbExponent);
  let colour = albedo * shade * limb;

  // ── Analytic depth ────────────────────────────────────────────────────────
  // The SAME mvp the vertex stage used, applied to the real surface point.
  let clipHit = u.mvp * vec4<f32>(ng, 1.0);

  var out: FSOut;
  out.colour = vec4<f32>(colour, 1.0);
  out.depth = clipHit.z / clipHit.w;
  return out;
}
