// lib/sphere.wesl — shared sphere uniform layout + local-to-clip helper.
//
// Every renderer that draws a sphere-shaped body (Earth, planets,
// stars) ends up needing the same thing: an MVP matrix that
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

// ── TintedSphereUniforms ─────────────────────────────────────────────
//
// 'SphereUniforms' plus one solid colour — the uniform layout for
// renderers that bind a single per-draw RGB alongside the MVP through a
// non-dynamic uniform buffer.  The star renderer is the current
// consumer (its emissive spectral colour); centralising the struct here
// (rather than duplicating it per renderer) keeps the byte layout a
// single source of truth across the vertex/fragment module pair and its
// CPU-side uploader.  The planet renderer does NOT bind this struct —
// it draws every seeded planet with one instanced draw, so its albedo
// rides in a per-instance vertex attribute instead of a uniform; see
// 'planetRenderer's module header for why instancing replaces a
// per-draw uniform there.
//
// Why not extend 'SphereUniforms' with a colour field?  WGSL has no
// optional fields — the Earth genuinely binds a 64-byte buffer, and
// silently growing the shared struct would force a dead 16-byte tail
// onto every existing uploader.  A second named struct
// keeps each renderer's buffer exactly as large as what its shaders
// read.
//
// ## Byte layout (uniform address space)
//
//   offset  0..63: mvp  (mat4x4<f32>, column-major, 64 bytes)
//   offset 64..75: tint (vec3<f32> — 16-byte ALIGNED, starting at the
//                        already-aligned offset 64; 12 bytes of data)
//   offset 76..79: implicit trailing pad — a struct's size rounds up
//                  to its alignment (16), so 76 rounds to 80.
//   total: 80 bytes.
//
// The CPU side therefore uploads 20 f32s: 16 for the mvp, 3 for the
// tint, one zeroed pad float.  'tint' carries the star's spectral
// emissive colour, linear RGB, correct for the rgba16float HDR
// foreground target.

struct TintedSphereUniforms {
  mvp: mat4x4<f32>,
  tint: vec3<f32>,
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
