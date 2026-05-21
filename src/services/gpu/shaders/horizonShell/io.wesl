// horizonShell/io.wesl — shared structs for the cosmic-horizon shell.
//
// The shell is rendered as an analytic ray-marched sphere, NOT a
// tessellated mesh.  A single fullscreen quad covers the screen; the
// fragment stage builds a per-pixel world-space view ray from the
// camera basis + FOV and intersects it with the sphere (centred at the
// world origin, radius = the comoving particle-horizon distance).  This
// gives a pixel-perfect silhouette with zero tessellation artefacts.
//
// ## Why camera-basis rays (not an inverse-matrix unprojection)
//
// The view-projection has a near:far ratio of ~5e6 (0.01 : 50000 Mpc),
// so inverting it to unproject screen corners is numerically unstable —
// near the far plane the homogeneous w shrinks and the perspective
// divide amplifies error, making the reconstructed sphere wobble in
// size frame-to-frame.  Instead we pass the camera's world-space basis
// (forward/right/up) and FOV directly and build the ray analytically:
//
//   rayDir = normalize(forward
//                    + ndc.x * tanHalfFovY * aspect * right
//                    + ndc.y * tanHalfFovY * up)
//
// which is exact and depends on nothing near/far-related.
//
// ## Why Gpc units
//
// The ray-sphere quadratic's 'dot(center, center)' term reaches ~9e8 in
// Mpc — past fp32's exact-integer range (~1.67e7) — so we work in
// GIGAPARSECS where it's ~900, comfortably precise.  Ray directions are
// unitless; only 'cameraPosGpc' and 'radiusGpc' carry the unit choice.

// ── Uniforms layout (64 bytes) ─────────────────────────────────────
//
//   offset 0  : camForward    (vec3<f32>) + tanHalfFovY (f32)
//   offset 16 : camRight      (vec3<f32>) + aspect      (f32)
//   offset 32 : camUp         (vec3<f32>) + radiusGpc   (f32)
//   offset 48 : cameraPosGpc  (vec3<f32>) + _pad        (f32)

struct Uniforms {
  camForward: vec3<f32>,
  tanHalfFovY: f32,
  camRight: vec3<f32>,
  aspect: f32,
  camUp: vec3<f32>,
  radiusGpc: f32,
  cameraPosGpc: vec3<f32>,
  _pad: f32,
};

// ── Vertex-to-fragment interface ────────────────────────────────────

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // NDC of this fragment in [-1, 1]², interpolated linearly across the
  // fullscreen quad.  The fragment builds the view ray from it.
  @location(0) ndc: vec2<f32>,
};
