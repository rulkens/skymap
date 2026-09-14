// atmosphere/froxelSlices.wesl — geometry derivations, over budget on that
// basis. The three things the aerial-perspective bake and the apply must agree
// on or the volume mis-registers invisibly: the far bound, the slice<->distance
// mapping in both directions, and the ray a screen texel stands for.
//
// Everything is passed, never captured — a WESL module cannot see a consumer's
// '@group/@binding' (scattering.wesl's header states the rule). That is also
// why the ray reconstruction lives HERE and not only in the apply's fragment:
// "the bake's ray equals the apply's ray by construction" is reachable only as
// one parameterised function both halves call. 'froxelSliceCoord' takes
// sliceCount for the same reason of exactness — the texel-centre offset needs
// N, so the spec's two-argument form would sit half a slice off its inverse.
//
// Radii and distances are LOCAL units: the frame where the atmosphere top
// radius is 1, the frame the shell fragment already marches in.
//
// Two landmines the callers inherit:
//
// 1. Dividing by 'P.w' is safe in 'froxelRayDistance' and ONLY there. Its
//    caller reaches it only for a depth that differs from the far-plane clear
//    value, so w is bounded away from zero. 'froxelRayDir' never divides — at
//    the far plane w -> 0 and the homogeneous form degrades gracefully to the
//    ray's own point at infinity (docs/RENDERER.md).
//
// 2. 'P.xyz - camPosLocal * P.w' cancels catastrophically for a point near the
//    camera: in f32 top-radius units (Earth's top is about 6,471 km, so one ulp
//    of a unit coordinate is about 0.6 m) the reconstructed distance carries a
//    ~metre ABSOLUTE error floor. Fine by construction — fog is a
//    kilometre-scale effect, and at metre range the lookup lands in the
//    identity slice regardless. Recorded so nobody "fixes" it into a
//    divide-then-subtract form, which trades a harmless absolute floor for the
//    far-plane blow-up the homogeneous form exists to avoid.

// The longest ray that can both graze the ground and stay under the top:
// camera-to-ground-tangent plus tangent-to-top. The max() guards the surface
// case, where camRadius and bottomRadius differ by far less than an f32 ulp of
// either and the difference of squares can land just below zero — a NaN here
// would poison the whole volume.
fn froxelMaxDistance(camRadius: f32, bottomRadius: f32) -> f32 {
  let groundSq = bottomRadius * bottomRadius;
  return sqrt(max(camRadius * camRadius - groundSq, 0.0))
       + sqrt(max(1.0 - groundSq, 0.0));
}

// Slice index -> the distance its stored integral runs to. Squared over [0, D]
// to spend resolution where the fog gradient is, and so that slice 0 is EXACTLY
// zero: the identity the apply relies on (transmittance 1, in-scatter 0) rather
// than a near-camera slab of already-accumulated fog.
fn froxelSliceDistance(slice: f32, sliceCount: f32, maxDistance: f32) -> f32 {
  let t = slice / (sliceCount - 1.0);
  return maxDistance * t * t;
}

// The inverse, as a NORMALIZED 3D texture w landing on texel centres, so that
// w(froxelSliceDistance(i, N, D)) == (i + 0.5) / N. The clamp is the documented
// behaviour past D (terrain lifted above the ground radius can outrun the
// bound): the last slice's fog is reused rather than wrapping.
fn froxelSliceCoord(distance: f32, sliceCount: f32, maxDistance: f32) -> f32 {
  let t = sqrt(clamp(distance / maxDistance, 0.0, 1.0));
  return (t * (sliceCount - 1.0) + 0.5) / sliceCount;
}

// The one numerator the direction and the distance both read, so they cannot
// describe two different rays. Returns 'P.xyz - cam * P.w' in xyz and P.w in w,
// for P the unprojection of 'uv' at clip depth 'clipZ'; the xy mapping inverts
// fullscreenVertex's own ('uv = ((xy+1)*0.5, (1-xy)*0.5)').
fn froxelUnproject(
  invMvp: mat4x4<f32>,
  camPosLocal: vec3<f32>,
  uv: vec2<f32>,
  clipZ: f32,
) -> vec4<f32> {
  let xy = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let p = invMvp * vec4<f32>(xy, clipZ, 1.0);
  return vec4<f32>(p.xyz - camPosLocal * p.w, p.w);
}

// The view ray for 'uv'. Reversed-Z puts the far plane at z = 0, and w's sign
// is folded in rather than divided out (landmine 1). Renormalized because a
// non-uniformly scaled model transform leaves the unprojected difference
// unnormalized — the same reason the shell's dir derivation does.
fn froxelRayDir(invMvp: mat4x4<f32>, camPosLocal: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let p = froxelUnproject(invMvp, camPosLocal, uv, 0.0);
  var v = p.xyz;
  if (p.w < 0.0) {
    v = -v;
  }
  return normalize(v);
}

// Distance from the camera to the depth sample at 'uv', in the ray's own frame.
// abs() keeps the length positive for the behind-the-eye sign convention.
fn froxelRayDistance(
  invMvp: mat4x4<f32>,
  camPosLocal: vec3<f32>,
  uv: vec2<f32>,
  depth: f32,
) -> f32 {
  let p = froxelUnproject(invMvp, camPosLocal, uv, depth);
  return length(p.xyz) / abs(p.w);
}
