// lib/analyticSphere.wesl — the ray-traced-sphere core: hit, equirectangular
// uv, wrap-safe uv gradients, analytic fragment depth.
//
// A body drawn analytically rasterises a coarse proxy shell that circumscribes
// it, and then RECOVERS the real surface per fragment: cast a ray from the
// camera through the fragment's proxy position, intersect the unit sphere at
// the origin, and derive the normal, the texture coordinate and the depth from
// that hit. The silhouette becomes pixel-exact instead of a 48-gon, and the
// normal exact instead of a barycentric blend.
//
// Everything here works in the LOCAL frame, where the body is the unit sphere
// centred at the origin. Oblateness is free in that frame: 'composeBodyMvp'
// folds a body's flattening into a non-uniform model-Z scale, so a flattened
// body is still a unit sphere locally and needs no ellipsoid maths -- provided
// the ray ORIGIN is carried into the same frame ('camPosLocal' takes the
// matching oblateness parameter for exactly this).
//
// Following the 'lib' convention ('lib/flow.wesl', 'atmosphere/scattering.wesl',
// 'lib/sphere.wesl::clip_from_local'): every input arrives as a PARAMETER.
// WESL has no global state -- a lib module cannot see a consumer's
// '@group'/'@binding' declarations -- so the mvp, the ray and the uv are all
// passed in, and this module declares no bindings, no entry points and no
// '@builtin(position)'-bearing struct.
//
// ## The grazing fallback, and why derivatives run before 'discard'
//
// 'dpdx'/'dpdy' require UNIFORM control flow, so a fragment that samples with
// hand-computed gradients must take them BEFORE it discards. That in turn means
// the MISSED lanes of a limb quad still contribute to their neighbours'
// derivatives, and a garbage uv in one lane poisons the whole 2x2 quad. Hence
// 'hitUnitSphere' returns a plausible point on a miss rather than nothing: the
// ray is clamped to its closest-approach parameter and normalized onto the
// sphere, which is C0-continuous with the true hit as the limb is crossed. Limb
// gradients therefore stay finite, and the caller drops the missed lanes once
// every derivative has been taken.
//
// ## The uv convention, and the (0, 1] vs [0.5, 1.5) non-difference
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
// ## The two-seam gradient trick
//
// What is NOT free is the derivative. Per-fragment u jumps by 1.0 across the
// antimeridian, so a 2x2 quad straddling that meridian sees 'dpdx(u) ~ 1', asks
// for a footprint an entire texture wide, and picks the coarsest mip -- a bright
// blurred one-pixel line down the body. A mesh path never had this, because its
// vertex u is monotonic across the whole sphere.
//
// The fix is 'textureSampleGrad' with WRAP-CORRECTED gradients. We build a
// SECOND u shifted half a turn ('fract(u + 0.5)'), whose own discontinuity sits
// on the prime meridian -- half a sphere away from the first. Any quad small
// enough to matter straddles at most one of the two, so per axis we take
// whichever of the two derivatives has the smaller magnitude: on the seam that
// discards the spurious ~1.0 jump and keeps the honest one; everywhere else the
// two are equal and the choice is a no-op. Every texture read of the same uv
// reuses the one corrected gradient pair.
//
// ## Depth, and why there is NO reversed-Z flip
//
// Writing '@builtin(frag_depth)' is mandatory: the rasteriser's interpolated
// depth belongs to the PROXY, which is nowhere near the surface, so leaving it
// alone would put every body behind everything else. 'fragDepthFromLocal'
// projects the analytic hit through the SAME mvp the vertex stage used and
// returns 'clip.z / clip.w' -- byte-for-byte what the rasteriser would have
// produced had it drawn the true surface, on either depth convention. NEAR0 is
// reversed-Z ('SLAB_REVERSED_Z[NEAR0] = true': infinite far, clear 0,
// 'depthCompare: greater'), and reversed-Z lives entirely inside the projection
// matrix -- clip.z/clip.w already comes out in [0, 1] with 1 at the near plane.
// So there is NO flip to apply, and this stays correct if a slab's convention is
// ever switched. Emitting '1 - z', or branching on a reversedZ flag, would be
// the bug.
//
// Two consequences worth knowing: writing frag_depth disables early-Z for that
// pipeline, and a hit nearer than the near plane is CLAMPED to 1.0 rather than
// clipped away (the vertex-stage near clip no longer governs what is shaded).

import package::lib::math::PI;
import package::lib::math::TAU;
import package::lib::sphere::clip_from_local;
import package::lib::util::raySphere;

// The equirectangular map-centre registration offset. WESL cannot import the TS
// 'TEXTURE_PRIME_MERIDIAN_U', so the 0.5 is re-encoded here -- the same
// greppable-not-importable arrangement 'earth/fragment.wesl' documents. Source
// of truth: 'src/data/bodies/texturePrimeMeridianU.ts'.
const TEXTURE_PRIME_MERIDIAN_U: f32 = 0.5;

// The sphere centre every test here uses: the body centre, at the local origin.
const LOCAL_ORIGIN = vec3<f32>(0.0, 0.0, 0.0);

// Radial blow-up of the coarse proxy shell, in body radii. It must exceed the
// mesh's inscribed-silhouette deficit -- '1 - cos(half-step)' -- at the WORST
// point the silhouette can cut a facet, not just the easy one. At a facet's
// edge midpoint only one 7.5 deg step applies: '1 - cos(3.75 deg) = 0.214%' of
// the radius at 48x24 ('sphereTessellation.ts'). Near a facet's diagonal both
// steps combine (half-diagonal roughly 5.3 deg): '1 - cos(5.3 deg) = 0.43%'.
// Either way the proxy's own outline would otherwise clip the analytic sphere
// it exists to reveal, shaving exactly the limb pixels this primitive
// recovers. '1.05 * cos(5.3 deg) = 1.05 * 0.9957 = 1.0455', comfortably
// outside 1.0 even at the worst case, so the projected proxy disc strictly
// contains the true disc at every camera distance. 5% is cheap because the
// proxy is never shaded, only rasterised, and never itself visible: every
// fragment either hits the unit sphere or discards, so the extra 5% never
// reaches a pixel.
//
// Consumers pair it with 'cullMode: front', so the FAR hemisphere of the shell
// is what rasterises. Front faces would vanish the moment the camera crossed
// inside the shell -- a legal close approach, 5% of a body radius above the
// surface -- taking the body with them. The far hemisphere still covers the whole
// disc from in there, because the near hemisphere is behind the eye.
const PROXY_SCALE: f32 = 1.05;

// The outcome of a ray cast at the unit sphere. 'point' is ALWAYS unit length --
// the true entry point on a hit, the closest-approach direction on a miss (see
// the header's grazing fallback). Callers shade from 'point' unconditionally and
// consult 'hit' only when deciding whether to keep the fragment.
struct SphereHit {
  hit: bool,
  point: vec3<f32>,
};

// A wrap-corrected screen-space derivative pair for an equirectangular uv, ready
// to hand to 'textureSampleGrad'.
struct UvGradients {
  ddx: vec2<f32>,
  ddy: vec2<f32>,
};

// hitUnitSphere — cast 'rd' from 'ro' at the unit sphere centred on the local
// origin. 'rd' must be unit length; on a proxy-shell fragment that means
// normalizing the DIFFERENCE after interpolation, since the interpolated proxy
// position is not itself unit length.
fn hitUnitSphere(ro: vec3<f32>, rd: vec3<f32>) -> SphereHit {
  let roots = raySphere(ro, rd, LOCAL_ORIGIN, 1.0);
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

  var out: SphereHit;
  out.hit = didHit;
  // 'normalize' does double duty: it is the exact geometric normal for a real
  // hit, and it projects the grazing fallback onto the sphere for a miss.
  out.point = normalize(ro + rd * t);
  return out;
}

// equirectUvFromDir — a unit direction in the body's local frame to the
// equirectangular uv 'uvSphereMesh' bakes into its vertices. 'dir' is assumed
// unit length (every 'SphereHit.point' is). u lands in (0, 1]; see the header
// for why that is sampler-identical to the mesh's [0.5, 1.5).
fn equirectUvFromDir(dir: vec3<f32>) -> vec2<f32> {
  let lat = asin(clamp(dir.z, -1.0, 1.0));
  let lon = atan2(dir.y, dir.x); // (-PI, PI]
  return vec2<f32>(lon / TAU + TEXTURE_PRIME_MERIDIAN_U, lat / PI + 0.5);
}

// equirectUvGradients — the wrap-safe derivative pair for an equirectangular uv.
// Takes 'dpdx'/'dpdy' internally, so it inherits their UNIFORM-control-flow
// requirement: call it before any 'discard'.
fn equirectUvGradients(uv: vec2<f32>) -> UvGradients {
  // Two u parameterisations half a turn apart, so their seams cannot coincide.
  let uSeamAnti = fract(uv.x);
  let uSeamPrime = fract(uv.x + 0.5);
  let dAntiDx = dpdx(uSeamAnti);
  let dAntiDy = dpdy(uSeamAnti);
  let dPrimeDx = dpdx(uSeamPrime);
  let dPrimeDy = dpdy(uSeamPrime);
  // Per axis, keep the smaller-magnitude derivative: the seam-straddling one
  // carries a spurious whole-turn jump, the other carries the true footprint.
  let dudx = select(dPrimeDx, dAntiDx, abs(dAntiDx) < abs(dPrimeDx));
  let dudy = select(dPrimeDy, dAntiDy, abs(dAntiDy) < abs(dPrimeDy));
  // v is monotonic pole to pole -- no seam, so its derivative is taken plainly.
  var out: UvGradients;
  out.ddx = vec2<f32>(dudx, dpdx(uv.y));
  out.ddy = vec2<f32>(dudy, dpdy(uv.y));
  return out;
}

// fragDepthFromLocal — the '@builtin(frag_depth)' value for a point in the
// body's local frame, projected through the SAME mvp the vertex stage used. No
// reversed-Z branch: see the header.
fn fragDepthFromLocal(mvp: mat4x4<f32>, pLocal: vec3<f32>) -> f32 {
  let clip = clip_from_local(mvp, pLocal);
  return clip.z / clip.w;
}
