// zoneOfAvoidance/io.wesl — shared structs for the galactic-plane dust-band
// guide layer.
//
// Same fullscreen-quad + camera-basis-ray technique as horizonShell/io.wesl:
// one 6-vertex triangle pair in clip space, the fragment stage builds a
// per-pixel world-space ray from the camera basis and intersects it with two
// concentric spheres (radius 'innerRadiusMpc' / 'outerRadiusMpc') centred at
// the world origin (the catalog observer). Unlike the horizon shell, the
// band's radii (3..380 Mpc) stay well inside fp32's exact-integer range, so
// there's no Gpc-unit workaround here — everything is plain Mpc.
//
// worldToGalactic's rotation basis (GAL_X_EQ/GAL_Y_EQ/GAL_Z_EQ) is a
// compile-time constant in 'lib/util.wesl', not a uniform field — see that
// module's contract. The spec's first draft rode the basis rows in this
// struct; dropping them is what keeps this under 128 bytes.

// ── Uniforms layout (112 bytes) ─────────────────────────────────────
//
//   offset  0 : camForward    (vec3<f32>) + tanHalfFovY    (f32)
//   offset 16 : camRight      (vec3<f32>) + aspect         (f32)
//   offset 32 : camUp         (vec3<f32>) + innerRadiusMpc (f32)
//   offset 48 : cameraPosMpc  (vec3<f32>) + outerRadiusMpc (f32)
//   offset 64 : color         (vec3<f32>) + bulgeDeg       (f32)
//   offset 80 : anticenterDeg (f32), intensity (f32), radialFalloffMpc (f32), edgeSharpness (f32)
//   offset 96 : fadeAlpha (f32), packedId (u32), _pad0 (f32), _pad1 (f32)
//
// Each 'vec3 + f32' pair above packs into one 16-byte slot the same way
// horizonShell's does — WGSL's uniform-address-space layout gives vec3<f32>
// 16-byte alignment/12-byte size, so a trailing f32 fills the gap for free.
// 'color'/'intensity'/'edgeSharpness'/'fadeAlpha' are 'ZoneOfAvoidanceTuning'
// fields verbatim (see that type); 'innerRadiusMpc'/'outerRadiusMpc'/
// 'bulgeDeg'/'anticenterDeg' are the shape placeholders the layer passes in
// alongside the tuning cluster. 'radialFalloffMpc' is the ONE exception —
// the tuning type's 'radialFalloff' is a normalised [0, 1] fraction of the
// shell span (a DebugPanel-friendly unit); the CPU side converts it to an
// absolute Mpc e-folding length ('radialFalloff * (outerRadiusMpc -
// innerRadiusMpc)', see zoneOfAvoidanceRenderer.ts) before writing this
// field, so the shader only ever sees the one currency its exponential
// distance-decay term actually needs. 'packedId' is the band's constant
// pick identity (written once at construction, unread by the visual
// fragment) — see fragmentPick.wesl.

struct Uniforms {
  camForward: vec3<f32>,
  tanHalfFovY: f32,
  camRight: vec3<f32>,
  aspect: f32,
  camUp: vec3<f32>,
  innerRadiusMpc: f32,
  cameraPosMpc: vec3<f32>,
  outerRadiusMpc: f32,
  color: vec3<f32>,
  bulgeDeg: f32,
  anticenterDeg: f32,
  intensity: f32,
  radialFalloffMpc: f32,
  edgeSharpness: f32,
  fadeAlpha: f32,
  packedId: u32,
  _pad0: f32,
  _pad1: f32,
};

// ── Vertex-to-fragment interface ────────────────────────────────────

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // NDC of this fragment in [-1, 1]², interpolated linearly across the
  // fullscreen quad. The fragment builds the view ray from it.
  @location(0) ndc: vec2<f32>,
};
