// proceduralDisks/io.wesl — shared structs for the procedural galaxy
// impostor pipeline.
//
// Sibling pipeline to 'texturedDisks' (atlas-textured impostor) and 'points' (screen-
// aligned billboards). Renders every galaxy whose apparent size
// exceeds 8 px (with a crossfade up to 14 px) as a 3D-oriented quad
// shaded with a two-component brightness profile (Gaussian bulge +
// exponential disk). No texture sampling — the fragment stage
// generates the shape entirely from per-fragment math.
//
// This file is the 'interface' module of the proceduralDisks
// renderer family. It declares the structs that BOTH the vertex and
// fragment entry points need to agree on byte-for-byte:
//
//   - 'Uniforms'   — the @group(0) @binding(0) uniform buffer layout.
//   - 'InstanceIn' — the per-instance vertex attributes.
//   - 'VsOut'      — the vertex-to-fragment interface.
//
// ## Why a separate io module
//
// Originally everything lived in a single 'proceduralDisks.wesl'.
// Splitting it into io + vertex + fragment mirrors the points/ and
// milkyWay/ splits (tasks 13 and 14) so each stage compiles a
// strictly-smaller shader module from disjoint source. The vertex
// stage runs the disk-plane orientation math; the fragment stage
// runs the procedural brightness profile + colour-ramp lookup —
// neither depends on the other's helpers.
//
// ## Why bindings live in the consuming files, not here
//
// WESL has no global state — bindings are module-local declarations
// that cannot be exported. The vertex stage redeclares the uniform
// binding (it reads cam.viewProj for the world-to-clip projection).
// The fragment stage doesn't read 'u' today, so it doesn't declare
// the binding — but the WebGPU bind-group layout in
// 'proceduralDiskRenderer.ts' still tags binding 0 with VERTEX |
// FRAGMENT visibility for ABI continuity with sibling renderers
// (the visibility bit just means 'either stage may read it'; with
// only the vertex shader actually consuming the binding, the
// 'FRAGMENT' bit is harmless paint).

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// 96-byte uniform buffer.  The first 80 bytes are the shared
// 'CameraUniforms' prefix (viewProj + viewportPx + 8B reserved pad);
// the renderer-specific 'camPosWorld + pxPerRad' pair sits AFTER it
// starting at offset 80, matching the disks / quads layout.
//
// 'camPosWorld' + 'pxPerRad' are preserved in the layout for ABI
// continuity with the JS upload path
// ('proceduralDiskRenderer.ts' still writes them at offsets 80/92),
// but the world-fixed disk math doesn't read either — orientation
// derives from the line of sight 'normalize(pos)' (Earth → galaxy),
// not the camera, and the procedural shader has no apparent-size
// scaling that would consult 'pxPerRad'. Same intentional ABI-
// preservation pattern as disks.

struct Uniforms {
  cam: CameraUniforms,
  // 'camPosWorld' + 'pxPerRad' are preserved in the layout for ABI
  // continuity with the JS upload path (proceduralDiskRenderer.ts still
  // writes them at offsets 80/92), but the world-fixed disk math
  // doesn't read either — orientation derives from the line of sight
  // 'normalize(pos)' (Earth → galaxy), not the camera, and the
  // procedural shader has no apparent-size scaling that would consult
  // 'pxPerRad'.  Same intentional ABI-preservation pattern as
  // texturedDisks.
  camPosWorld: vec3<f32>,
  pxPerRad: f32,
};

// ── per-instance attributes ────────────────────────────────────────

struct InstanceIn {
  @location(0) posSize: vec4<f32>,         // x, y, z, sizeWorldMpc
  @location(1) orientation: vec4<f32>,     // axisRatio, positionAngleDeg, pickIdBits, _
  @location(2) extras: vec4<f32>,          // colourIndex, crossfadeAlpha, procFadeOut, sbAmp
};

// ── vertex-to-fragment interface ────────────────────────────────────
//
// 'uv' carries the disk-local corner offset in [-1, 1]² (i.e. the
// raw quadCorner output, NOT remapped to [0, 1]²) so the fragment
// stage can read 'length(in.uv)' as the radial coordinate of the
// procedural brightness profile. Per-instance scalar passes use
// flat interpolation because they are constant across the six
// vertices of one instance — the GPU can skip the interpolator slot
// entirely.

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Disk-local UV in [-1, 1]² — used by the fragment shader to compute
  // radial distance for the brightness profile.
  @location(0) uv: vec2<f32>,
  // Per-instance colour-index value (forwarded for the colour ramp).
  @location(1) @interpolate(flat) colourIndex: f32,
  // Per-instance fade-IN alpha against the points pass (0..1).
  @location(2) @interpolate(flat) crossfadeAlpha: f32,
  // Per-instance fade-OUT multiplier against the textured-disk pass for
  // galaxies with a curated famous WebP loaded; 1.0 means no fade-out.
  // See 'ProceduralDiskInstance.d.ts' for the full semantic.
  @location(3) @interpolate(flat) procFadeOut: f32,
  // Per-instance cluster-focus dim in [0.08, 1.0]: 1.0 for members of the
  // focused structure (and for everything at rest), 0.08 for non-members, ramped
  // by the focus blend. Computed once per instance in the vertex stage.
  @location(4) @interpolate(flat) focusDim: f32,
  // CPU-packed pick identity: '(sourceCode << 27) | localIdx', stored as
  // raw bits in instance slot 6 (orientation.z) and recovered here via
  // bitcast. Flat because every fragment of one quad shares the same galaxy
  // identity. Only the pick fragment declares and reads 'pickId'; the visual
  // fragment does not, so the value is simply ignored there.
  @location(5) @interpolate(flat) pickId: u32,
  // Per-instance effective surface-brightness amplitude (already scaled by
  // the live sbScale / sbMax / sbBoost / brightness sliders on the CPU).
  // Flat because it's constant across a quad's fragments; the fragment
  // stage multiplies its brightness profile by this so intrinsically
  // bright galaxies push their HDR core above the bloom threshold.
  @location(6) @interpolate(flat) sbAmp: f32,
};
