// selectionRing/io.wesl — shared struct definitions for the selection-ring
// renderer.  Imported by vertex.wesl + fragment.wesl; bindings themselves
// are re-declared in the consuming files (WESL has no global state — same
// pattern as markerLines/io.wesl).
//
// ## Uniform layout (two UBOs, two bindings)
//
// @group(0) @binding(0): shared CameraUniforms prefix (80 bytes; viewProj
//   + viewportPx + 2 reserved pads).  Drives world-space → clip projection
//   and the px → clip-space conversion for corner expansion.
//
// @group(0) @binding(1): SelectionRingUniforms (16 bytes):
//   bytes  0..11  worldPos       vec3<f32> — the selected galaxy's world Mpc
//   bytes 12..15  ringRadiusPx   f32       — CPU-computed pixel radius
//
// Two uniform bindings rather than one concatenated struct so the per-frame
// upload writes only the 16-byte selection tail when the camera hasn't
// changed, while the camera prefix re-uploads at its own cadence.
//
// ## Why no per-instance attributes
//
// One instance per frame at most.  The vertex stage reads `u.sel.worldPos`
// from the uniform and uses `@builtin(vertex_index)` to pick its corner
// via `quadCorner(vi)`.  No vertex buffer needed beyond the implicit
// 6-vertex non-indexed draw.

import package::lib::camera::CameraUniforms;

struct SelectionRingUniforms {
  // World-space position of the selected galaxy in Mpc.  Projected to
  // clip space via the shared CameraUniforms viewProj.
  worldPos: vec3<f32>,
  // Final on-screen ring radius in CSS pixels.  CPU-computed as
  // `max(pointSizePx, apparentPxRadius) * 8`.
  ringRadiusPx: f32,
};

// ── vertex-to-fragment interface ──────────────────────────────────
//
// `uv` is the unit-quad corner in [-1, +1]² — the fragment stage uses
// `dot(uv, uv)` for the radial annulus mask.  `ringRadiusPx` is
// forward-flat so the fragment can compute the band fraction without
// re-binding the uniform.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) ringRadiusPx: f32,
};
