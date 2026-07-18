// starPoints/io.wesl — shared struct declarations for the distant scene
// stars (the hand-seeded famous / neighbourhood stars). Imported by
// starPoints/vertex.wesl and starPoints/fragment.wesl.
//
// The neighbourhood's stars render as additive point-sprite billboards:
// the vertex stage expands each seeded star into a screen-sized quad, sizes
// and brightens it on the SAME photometric model the survey (Gaia bin) leaf
// stars use (lib/starPhotometry.wesl) — a fixed slider-scaled radius carrying
// inverse-square apparent flux as a peak INTENSITY — and forwards the quad
// corner, the per-star linear-RGB tint and that peak; the fragment stage draws
// the rim-zeroed Gaussian dot and applies the shared hue-preserving knee. Two
// structs travel here:
//
//   VSOut          — the vertex/fragment contract. One authoritative
//                    declaration makes @location drift structurally impossible
//                    (the same reasoning starCatalog/io.wesl states for its
//                    VSOut), keeping the corner + tint + intensity locations
//                    locked to the vertex stage that produces them.
//   StarPointUniforms — the @group(0) per-frame uniform: the shared 80-byte
//                    'CameraUniforms' prefix (rebased vp + viewportPx) followed
//                    by the user's base star-dot size 'sizePx' and star-brightness
//                    trim 'brightness'. The two scalars mirror the survey
//                    'StarUniforms' (minus its aggregate-only 'glowOverlap'):
//                    the famous layer forwards the SAME 'starCatalogs.sizePx' /
//                    exposure-ramped 'brightness' so a famous leaf and a survey
//                    leaf obey the identical settings.

import package::lib::camera::CameraUniforms;

// Per-frame @group(0) uniform. Byte layout (WGSL std140 uniform rules) must
// stay byte-exact with the renderer's uniform write (starPointRenderer.ts):
//
//   offset  0  cam         CameraUniforms  (80 B; viewProj + viewportPx + 2 pads)
//   offset 80  sizePx      f32             (user base star-dot size in px)
//   offset 84  brightness  f32             (user exposure trim; 1.0 = identity)
//   struct size 96 (rounded up from 88 to the 16-byte alignment CameraUniforms'
//   mat4x4 demands; the two scalars ride the rounding tail, so the padding is
//   float32[22..23] in the renderer scratch).
struct StarPointUniforms {
  cam: CameraUniforms,
  sizePx: f32,
  brightness: f32,
};

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Quad corner in [-1, +1]^2 — the fragment's distance-from-centre.
  @location(0) uv: vec2<f32>,
  // Per-star linear-RGB tint, flat across the quad.
  @location(1) color: vec3<f32>,
  // Flux-derived peak intensity, flat across the quad. The vertex stage sizes
  // the dot from the star's apparent flux + slider radius and hands the matching
  // peak here; the fragment scales the rim-zeroed Gaussian by it so the star's
  // INTEGRATED screen luminance is proportional to its apparent flux — the same
  // contract the survey leaf carries (lib/starPhotometry.wesl).
  @location(2) intensity: f32,
};
