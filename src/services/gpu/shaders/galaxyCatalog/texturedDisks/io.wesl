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
// 'instancedQuadRenderer.ts'. First 80 bytes are the shared
// 'CameraUniforms' prefix (viewProj + viewportPx + 8B reserved pad);
// 'camPos' sits at offset 80 followed by an f32 tail pad to round up
// to 16 bytes.
//
// 'camPos' is preserved for ABI continuity with the JS upload path,
// but the world-fixed disk math doesn't read it: a disk's orientation
// is an intrinsic galaxy property, independent of camera position. The
// camera contributes only via 'cam.viewProj' (consumed by 'worldToClip').

struct Uniforms {
  cam: CameraUniforms,
  camPos: vec3<f32>,
  _pad2: f32,
};

// ── per-instance attributes ────────────────────────────────────────
//
// 64 bytes / 16 floats per instance (matches BYTES_PER_INSTANCE in
// 'instancedQuadRenderer.ts'). Four vec4 slots: position+size, uvRect,
// the orientation pack (axisRatio, PA, fadeAlpha, reserved), and the
// hi-res LOD pack (layer index, crossfade alpha, nucleus offset x,
// nucleus offset y).

struct InstanceIn {
  @location(0) posSize: vec4<f32>,
  @location(1) uvRect:  vec4<f32>,
  // x: axisRatio, y: positionAngleDeg, z: fadeAlpha (per-frame distance ×
  // load fade multiplier from the engine), w: reserved padding.
  @location(2) orient:  vec4<f32>,
  // x: hiResLayerIdx (cast to i32 in the vertex stage; -1 means 'no
  // hi-res slot bound, sample atlas only'). y: hiResCrossfadeAlpha in
  // [0, 1] — fragment 'mix(atlas, hiRes, alpha)' weight. z, w: the
  // calibrated nucleus offset in the disk's local corner frame
  // ([0, 0] = centred); the vertex stage subtracts it from each corner
  // so a curated galaxy's nucleus lands on the catalog point.
  @location(3) hiRes:   vec4<f32>,
};

// ── vertex-to-fragment interface ────────────────────────────────────
//
// The hi-res layer index MUST be '@interpolate(flat)' — it's an
// integer discriminant, not a continuous value. Linear interpolation
// of a layer index across a triangle would address random nonsense
// layers per-pixel. Flat = take the provoking vertex's value verbatim.

struct VsOut {
  @builtin(position) clipPos:                              vec4<f32>,
  @location(0)       atlasUv:                              vec2<f32>,
  @location(1)       cornerUv:                             vec2<f32>,
  // Per-instance fade multiplier in [0, 1].
  @location(2)       fadeAlpha:                            f32,
  @location(3) @interpolate(flat) hiResLayerIdx:           i32,
  @location(4)                    hiResCrossfadeAlpha:     f32,
  // Per-instance cluster-focus dim in [0.08, 1.0]: 1.0 for members of the
  // focused structure (and at rest), 0.08 for non-members, ramped by the focus
  // blend. Computed once per instance in the vertex stage; flat because it
  // is constant across the quad.
  @location(5) @interpolate(flat) focusDim:                f32,
};
