// diskRadiusRing/io.wesl — shared struct definitions for the
// disk-radius debug-ring overlay.  Imported by vertex.wesl +
// fragment.wesl; the '@group/@binding' declarations themselves are
// re-declared in the consuming files (WESL has no global state — same
// pattern as selectionRing/io.wesl and texturedDisks/io.wesl).
//
// ## Uniform layout (two UBOs, two bindings)
//
// @group(0) @binding(0): shared CameraUniforms prefix (80 bytes; viewProj
//   + viewportPx + 2 reserved pads).  Drives the world-space → clip
//   projection.  The ring does NO pixel-space math, so the CPU leaves
//   'viewportPx' zero.
//
// @group(0) @binding(1): DiskRadiusRingUniforms (32 bytes):
//   bytes  0..11  center        vec3<f32> — galaxy world position (Mpc)
//   bytes 12..15  radiusWorld   f32       — ring radius (disk half-extent, Mpc)
//   bytes 16..19  paDeg         f32       — position angle, degrees (east of north)
//   bytes 20..23  axisRatio     f32       — b/a (cos of inclination)
//   bytes 24..27  _pad0         f32       — round to 16-byte alignment
//   bytes 28..31  _pad1         f32       —   (32 bytes total)
//
// Two uniform bindings rather than one concatenated struct so the camera
// prefix re-uploads at its own cadence; mirrors selectionRing exactly.
//
// ## Why no per-vertex attributes
//
// The ring is generated procedurally from '@builtin(vertex_index)' (a
// closed 96-segment line strip, vertices 0..96).  No vertex buffer is
// bound; the draw is non-indexed.

import package::lib::camera::CameraUniforms;

struct DiskRadiusRingUniforms {
  // World-space position of the galaxy in Mpc.  Projected to clip space
  // via the shared CameraUniforms viewProj.
  center: vec3<f32>,
  // Ring radius in Mpc — the procedural-disk half-extent we are
  // calibrating against the textured quad's projected edge.
  radiusWorld: f32,
  // Position angle, degrees (east of north).  Converted to radians and
  // fed to 'diskAxes' so the ring shares the disk's in-plane rotation.
  paDeg: f32,
  // Axis ratio b/a, used as cos(inclination) — the same value
  // texturedDisks clamps to 0.05 and passes through as 'cosI'.
  axisRatio: f32,
  // Two trailing pads round the struct to a 16-byte boundary so the
  // CPU-side 32-byte writeBuffer matches the WGSL std140 layout.
  _pad0: f32,
  _pad1: f32,
};

// ── vertex-to-fragment interface ──────────────────────────────────
//
// A solid-colour ring needs no varyings — the fragment emits a constant
// premultiplied cyan.  Only the clip-space position crosses the stage
// boundary.

struct VsOut {
  @builtin(position) pos: vec4<f32>,
};
