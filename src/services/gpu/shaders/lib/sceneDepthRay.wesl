// lib/sceneDepthRay.wesl — three functions of pure f32/reversed-Z landmine, so
// it runs over the comment ratio: reconstruct a camera ray, and the distance
// along it to a scene-depth texel, from a caller's own 'invMvp' (clip space to
// the CALLER's frame) and 'camPos' in that frame; distances share its units.
// 'FAR_DEPTH' is reversed-Z's far clear; CPU twin 'depthClearValueFor(true)'.

// The body slab's reversed-Z far-plane clear value; a texel still holding it
// has no geometry in front of it.
const FAR_DEPTH: f32 = 0.0;

// The one numerator the direction and the distance both read, so they cannot
// describe two different rays. The xy mapping inverts fullscreenVertex's own
// ('uv = ((xy+1)*0.5, (1-xy)*0.5)').
fn sceneRayUnproject(uv: vec2<f32>, clipZ: f32, invMvp: mat4x4<f32>, camPos: vec3<f32>) -> vec4<f32> {
  let xy = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
  let p = invMvp * vec4<f32>(xy, clipZ, 1.0);
  return vec4<f32>(p.xyz - camPos * p.w, p.w);
}

// The view ray for 'uv'. Reversed-Z puts the far plane at z = 0, so w's sign is
// FOLDED IN rather than divided out: at w -> 0 the homogeneous form degrades
// gracefully to the ray's own point at infinity, where a divide blows up into
// the uniform grey veil (docs/RENDERER.md).
fn sceneRayDir(uv: vec2<f32>, invMvp: mat4x4<f32>, camPos: vec3<f32>) -> vec3<f32> {
  let p = sceneRayUnproject(uv, 0.0, invMvp, camPos);
  var v = p.xyz;
  if (p.w < 0.0) {
    v = -v;
  }
  return normalize(v);
}

// Distance from the camera to the depth sample at 'uv', in the caller's frame.
// Dividing by 'w' is safe HERE only: callers reach this for a depth away from
// the far clear, so w is bounded off zero. The subtraction cancels near the
// camera (one f32 ulp is ~0.6 m at Earth's top) — a metre-scale ABSOLUTE floor,
// cheaper than divide-then-subtract's blow-up.
fn sceneRayDistance(uv: vec2<f32>, depth: f32, invMvp: mat4x4<f32>, camPos: vec3<f32>) -> f32 {
  let p = sceneRayUnproject(uv, depth, invMvp, camPos);
  return length(p.xyz) / abs(p.w);
}
