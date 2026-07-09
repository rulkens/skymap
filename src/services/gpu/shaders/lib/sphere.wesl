// lib/sphere.wesl — shared sphere uniform layout + local-to-clip helper.
//
// Every renderer that draws a sphere-shaped body (debug sphere, Earth,
// planets, stars) ends up needing the same thing: an MVP matrix that
// folds model transform + view + projection into one 4x4, and a vertex
// stage that multiplies a unit-sphere local position by it.
// Centralising the uniform struct and the helper here means:
//
//   1. One authoritative byte layout — 'SphereUniforms' is exactly 64
//      bytes (one mat4x4<f32>).  The CPU-side 'composeBodyMvp' writes
//      this exact layout; no per-renderer byte-offset arithmetic needed.
//   2. One definition of 'clip_from_local' to blame when something
//      projects wrong — see below for the MVP decomposition.
//   3. Future sphere renderers (Earth atmospherics, star glows, planet
//      surfaces) import from here rather than rolling their own matrix
//      wiring.
//
// ## Why a combined MVP, not separate M / VP?
//
// The rejected alternative was a three-matrix layout (model, view, proj
// separately).  None of the sphere renderers needs M or VP in isolation
// on the GPU: the vertex stage only ever computes 'mvp * localPos', and
// the world-space position (for lighting) is reconstructed via the
// inverse transform on the CPU and passed as a separate uniform.
// Separate M/VP would add 128 bytes of uniform data that the shader
// never unpacks.  A single combined MVP costs 64 bytes, which fits in
// one GPU cache line.
//
// ## Why NOT a captured '@group/@binding' var?
//
// WESL has no global state.  This module cannot see the renderer's
// '@group(0) @binding(0) var<uniform> u' declaration.  The helper
// 'clip_from_local' therefore takes 'mvp' as an explicit parameter --
// the same "pass cam, don't capture" rationale as 'worldToClip' in
// 'lib/camera.wesl'.  The function is portable to any renderer that
// binds 'SphereUniforms' at any group/binding it chooses.
//
// ## Byte layout
//
//   offset 0..63: mvp (mat4x4<f32>, column-major, 64 bytes)
//   total: 64 bytes.
//
// The CPU-side uploader writes exactly 16 Float32s starting at the
// buffer's base offset.  No padding is needed because mat4x4<f32>
// already satisfies 16-byte alignment.

struct SphereUniforms {
  mvp: mat4x4<f32>,
};

// ── clip_from_local ──────────────────────────────────────────────────
//
// Transform a unit-sphere local-space position to homogeneous clip
// space.  The MVP matrix folds model (scale + translate to world
// position) + view + projection into one product, computed CPU-side
// by 'composeBodyMvp' and uploaded once per draw.
//
// Why pass 'mvp' as a parameter rather than a module-level binding?
// See the module header -- WESL has no global state; taking 'mvp' as
// a parameter makes this helper portable to any renderer's binding
// layout, matching the 'worldToClip' convention in 'lib/camera.wesl'.
//
// Equivalent inline form: 'u.mvp * vec4<f32>(localPos, 1.0)'.

fn clip_from_local(mvp: mat4x4<f32>, localPos: vec3<f32>) -> vec4<f32> {
  return mvp * vec4<f32>(localPos, 1.0);
}
