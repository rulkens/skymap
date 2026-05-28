// texturedDisks/io.wesl — shared structs for the textured galaxy-disk
// (impostor-quad) pipeline. Sibling pipeline to 'proceduralDisks/'
// (procedural impostor for galaxies that don't yet have a thumbnail
// loaded) and 'points/' (screen-aligned billboards). This pipeline
// renders galaxies whose apparent pixel size exceeds the
// procedural-disk fade-in band as a 3D-oriented quad textured with the
// per-galaxy thumbnail atlas slot.
//
// Declares the three structs every entry point needs to agree on:
//
//   - 'Uniforms'   — the @group(0) @binding(0) uniform buffer layout.
//   - 'InstanceIn' — the per-instance vertex attributes.
//   - 'VsOut'      — the vertex-to-fragment interface.
//
// ## Why a separate io module
//
// io + vertex + fragment mirrors the points/ and milkyWay/ splits so
// each stage compiles a strictly-smaller shader module from disjoint
// source. The vertex stage doesn't read the atlas texture; the
// fragment stage doesn't run the orientation math.
//
// ## Why bindings live in the consuming files, not here
//
// WESL has no global state — bindings are module-local declarations,
// not exportable symbols. Each consuming file redeclares the
// bindings it needs (vertex.wesl: just the uniform; fragment.wesl:
// the atlas texture + sampler) using the structs imported from this
// authoritative module so the layout cannot drift.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// 96-byte uniform buffer matching the CPU-side UNIFORM_BYTES in
// 'diskRenderer.ts'.  The first 80 bytes are the shared
// 'CameraUniforms' prefix (viewProj + viewportPx + 8B reserved pad);
// the renderer's own 'camPos' vec3 sits at offset 80 followed by an
// f32 tail pad to round up to a 16-byte boundary.
//
// 'camPos' is preserved in the layout for ABI continuity with the JS
// upload path, but the world-fixed disk math doesn't read it: the
// disk's orientation is an intrinsic galaxy property, independent of
// where the camera sits. The camera contributes only via
// 'cam.viewProj' (consumed by 'worldToClip').

struct Uniforms {
  cam: CameraUniforms,
  // camPos is preserved in the layout for ABI continuity with the JS
  // upload path, but the world-fixed disk math doesn't read it: the
  // disk's orientation is an intrinsic galaxy property, independent of
  // where the camera sits.  The camera contributes only via
  // 'cam.viewProj' (consumed by 'worldToClip').
  camPos: vec3<f32>,
  _pad2: f32,
};

// ── per-instance attributes ────────────────────────────────────────
//
// 48 bytes / 12 floats per instance (matches BYTES_PER_INSTANCE in
// 'diskRenderer.ts'). Three vec4 slots: position+size, uvRect, and
// the orientation pack (axisRatio, PA, fadeAlpha, reserved).

struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  // x: axisRatio, y: positionAngleDeg, z: fadeAlpha (per-frame distance ×
  // load fade multiplier from the engine), w: reserved padding.
  @location(2) orient:  vec4<f32>,
};

// ── vertex-to-fragment interface ────────────────────────────────────

struct VsOut {
  @builtin(position) clipPos:   vec4<f32>,
  @location(0)       atlasUv:   vec2<f32>,
  @location(1)       cornerUv:  vec2<f32>,
  // Per-instance fade multiplier in [0, 1].
  @location(2)       fadeAlpha: f32,
};
