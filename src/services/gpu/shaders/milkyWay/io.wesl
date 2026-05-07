// milkyWay/io.wesl — shared structs for the Milky Way impostor pipeline.
//
// This file is the 'interface' module of the Milky Way impostor renderer
// family. It declares the two structs that BOTH the vertex and fragment
// entry points need to agree on byte-for-byte:
//
//   - 'Uniforms' — the @group(0) @binding(0) uniform buffer layout.
//   - 'VsOut'    — the vertex-to-fragment interface.
//
// ## Why a separate io module
//
// Originally everything lived in a single 'milkyWayImpostor.wesl' that
// contained both '@vertex fn vs' and '@fragment fn fs' alongside several
// kilobytes of fragment-only procedural-galaxy helpers (stars, height,
// galaxyNormal, shadeGalaxyDisk, renderGalaxy). The vertex stage doesn't
// need any of that — it just builds a view-aligned billboard basis and
// projects the corner positions through the camera. Splitting the file
// into io + vertex + fragment lets each stage compile a strictly-smaller
// shader module from the relevant subset of source, mirroring the
// convention adopted for points/* in the previous task.
//
// ## Why bindings live in the consuming files, not here
//
// WESL has no global state — a binding declaration like
// '@group(0) @binding(0) var<uniform> u: Uniforms' is a module-local
// declaration, not an exportable symbol. Importing 'u' across modules
// is not supported. The skymap project's lib/ files prove the same
// point: 'lib/camera.wesl' exposes 'CameraUniforms' + 'worldToClip'
// but the binding is declared fresh in every renderer that uses it. We
// follow that pattern here: vertex.wesl and fragment.wesl each declare
// '@group(0) @binding(0) var<uniform> u: Uniforms' with IDENTICAL
// layout numbers. WGSL is fine with multiple files declaring the same
// binding so long as the layout matches — and 'Uniforms' is imported
// from this single authoritative place, so the layout cannot drift
// between consumers.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// The first 80 bytes are the shared 'CameraUniforms' prefix from
// 'lib/camera.wesl' (viewProj + viewportPx + two reserved pad slots).
// Embedding it as a named member 'cam' rather than inlining the
// individual fields makes the cross-renderer audit story explicit:
// every renderer's first uniform field is now 'cam: CameraUniforms',
// and every projection call goes through 'worldToClip(u.cam, p)'.
//
// ## Why the field order changed (vs the pre-WESL layout)
//
// The pre-WESL-conversion layout had this shape:
//
//   offset 0  : viewProj           (mat4)
//   offset 64 : viewport           (vec2)
//   offset 72 : fadeAlpha          (f32)   <─── overlaps CameraUniforms
//   offset 76 : iTime              (f32)   <─── ._pad0/._pad1 slots
//   offset 80 : cameraPosWorld     (vec3)
//   offset 92 : _pad               (f32)
//   total: 96 bytes
//
// 'CameraUniforms' explicitly reserves bytes 72..79 as '_pad0/_pad1'
// (so renderers extending it can place their first vec3-aligned field
// at offset 80). The old impostor layout filled those bytes with
// 'fadeAlpha' + 'iTime' — which is fine for a hand-rolled struct but
// incompatible with embedding 'cam: CameraUniforms' as the first
// field. We can't drop CameraUniforms in as a pure prefix without
// moving the renderer-specific scalars somewhere else.
//
// Resolution: put 'cam: CameraUniforms' first (occupies 0..79), then
// pack the renderer-specific fields after. 'cameraPosWorld' goes at
// offset 80 (already 16-byte aligned, which vec3 requires), and the
// two f32 scalars 'fadeAlpha' + 'iTime' fall in naturally at 92 / 96.
// The trailing pad lands at 100..111 to round the struct size up to
// 112 bytes (a multiple of 16, the struct alignment for vec3-bearing
// types).
//
// ## Byte layout (canonical)
//
//   offset 0   : cam: CameraUniforms  (80 B; viewProj + viewportPx
//                                       + _pad0 + _pad1)
//   offset 80  : cameraPosWorld       (vec3; 12 B)
//   offset 92  : fadeAlpha            (f32; 4 B)
//   offset 96  : iTime                (f32; 4 B)
//   offset 100 : _pad                 (12 B; round up to 112)
//   total: 112 bytes
//
// CPU-side counterpart in 'milkyWayRenderer.ts' must write the
// floats at the matching f32 indices — see that file's 'draw' method
// for the new offset table.

struct Uniforms {
  // Shared camera prefix — viewProj for clip-space projection plus
  // the viewportPx slot every other renderer uses for pxPerRad math.
  // The impostor doesn't actually read viewportPx (its fragment
  // shader works in local UV directly); the field is present for
  // ABI symmetry with the rest of the engine.
  cam: CameraUniforms,
  // World-space camera position (Mpc).  Used by the vertex stage to
  // build the view-aligned billboard basis (the impostor always faces
  // the camera, so the user never sees its rectangular edge), and by
  // the fragment stage to drive the ShaderToy's synthetic camera —
  // transformed into the galactic frame and divided by the Milky Way's
  // physical half-extent, it becomes the 'ro' parameter to the existing
  // raymarched render logic.  As the user orbits the world origin, the
  // shader sees a corresponding rotation of its synthetic camera, so
  // the rendered spiral appears from different angles instead of
  // staying frozen in the original ShaderToy's hard-coded vantage.
  cameraPosWorld: vec3<f32>,
  // Distance-fade alpha pre-computed on the CPU
  // ('utils/math/milkyWayFade.ts').  Multiplied into the fragment's
  // emissive output and into alpha for premultiplied blend.
  fadeAlpha: f32,
  // iTime in seconds, scaled by 0.25 on the CPU before upload so the
  // ShaderToy's internal 'TIME = iTime*0.1' works out to a slow,
  // alive-but-not-spinning rotation.  Currently unread by the
  // fragment stage (animation is locked off — see 'fs' in
  // fragment.wesl) but retained for ABI symmetry and future
  // re-enablement.
  iTime: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

// ── vertex-to-fragment interface ────────────────────────────────────

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Local UV in [-1, 1]² (the corner offsets used to build the quad).
  // The fragment stage uses these for the soft edge fade only — the
  // synthetic-camera ray direction is now reconstructed from the
  // *world-space* fragment position (see VsOut.worldPos) so the
  // perspective is correct regardless of the impostor's screen size.
  @location(0) uv: vec2<f32>,
  // World-space position of this fragment's corresponding vertex.
  // The fragment stage interpolates this across the quad and
  // reconstructs the per-pixel world-space ray as
  // 'normalize(worldPos - cameraPosWorld)' — the actual ray that hits
  // this point on the impostor from the user's viewpoint.
  @location(1) worldPos: vec3<f32>,
};
