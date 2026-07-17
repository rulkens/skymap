// starPointPick.wesl — instanced pick billboard for the scene-star POINT
// partition (the sub-pixel seeded famous / neighbourhood stars).
//
// The pick twin of 'bodies/starPoints/vertex.wesl'. The visual stage sizes each
// dot from apparent flux and paints a soft Gaussian; the pick stage needs only a
// clickable footprint at the star's TRUE screen position, so it drops all the
// photometry and expands a fixed 18 px billboard, writing the star's packed
// identity where the round dot covers a pixel. One module carries both stages
// (vs + fsPick); bodyPickRenderer compiles it into its OWN GPUShaderModule for
// the points pipeline (never shared with the sphere pipeline — the 'auto'-layout
// trap).
//
// ## Why a fixed footprint, not the visual flux ramp
//
// A scene star bright enough to fill more than a few pixels has RESOLVED into a
// sphere and is picked through the 'drawSphere' path instead — the point
// partition is by construction the sub-pixel stars ('partitionStarsByResolution').
// So a fixed clickable floor IS the whole footprint here; there is no larger
// visual dot to match, unlike the survey star pick which clamps 'max(visual,
// floor)'.
//
// ## Why a generous 18 px footprint, larger than the survey clamp
//
// These are the <=25 seeded scene stars — sparse, named, and drawn with a label
// that invites a click. A too-small hit area makes those labelled targets feel
// unclickable, so their footprint is deliberately LARGER than the survey star
// pick's minimal clamp. The survey path (starCatalog/vertex.wesl) keeps its
// 3.5 px radius because dense field stars would occlude each other's picks if
// each grabbed a wide footprint; here the roster is tiny and well separated, so
// a 9 px radius (18 px diameter) grabs comfortably without any collision risk.
//
// ## The identity is written RAW
//
// Each instance's 'packedId' arrives fully packed from the CPU
// ('packSelection(sourceCode, seedIndex + PICK_SENTINEL_OFFSET)'). It rides an
// instance attribute (NOT '@builtin(instance_index)', which shifts as bodies
// enter/leave the resolved set) and the fragment writes it unchanged.
//
// ## Precision — camera-relative inputs
//
// 'posRelCamMpc' arrives already rebased into the CAMERA-RELATIVE frame (the eye
// subtracted, the eye offset folded into 'vp' via 'rebaseViewProj', both in
// f64), exactly as the visual starPoints stage receives it — so the raw
// parsec-scale anchor and the view translation never cancel catastrophically in
// f32. See starPointRenderer.ts's precision note.
//
// ## Attribute layout (stepMode 'instance', stride 16 bytes)
//
//   @location(0) posRelCamMpc: vec3<f32>  — camera-relative anchor, offset 0.
//   @location(1) packedId:     u32        — fully-packed pick id, offset 12.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(0) var<uniform> u: CameraUniforms;

// 18 px clickable footprint (9 px radius) — the WHOLE footprint for these <=25
// labelled scene stars, sized generously so a label's click invitation lands
// (see module header). Deliberately larger than the survey pick's minimal clamp.
const FAMOUS_STAR_PICK_RADIUS_PX: f32 = 9.0;

// Pull the clamped clip-z this far inside the far plane so a point sitting
// exactly ON it still passes the clip test (same epsilon the visual stage uses).
const CLIP_Z_EPS: f32 = 1e-4;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Quad corner in [-1, +1]^2 — the fragment's distance-from-centre.
  @location(0) uv: vec2<f32>,
  // Fully-packed pick id, flat across the quad (integer varyings must be flat).
  @location(1) @interpolate(flat) packedId: u32,
};

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) posRelCamMpc: vec3<f32>,
  @location(1) packedId: u32,
) -> VSOut {
  let center = worldToClip(u, posRelCamMpc);
  let corner = quadCorner(vi);
  let offset = expandBillboardScreen(u, center, FAMOUS_STAR_PICK_RADIUS_PX, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Survive the adaptive foreground far plane on a deep descent, as the visual
  // starPoints stage does. This pass IS depth tested (unlike the depthless
  // visual point pass), but the clamp stays benign: a beyond-far point lands at
  // z ~= w (the maximum depth), so any nearer body still wins the 'less' test —
  // the far sub-pixel star merely stays pickable instead of being clipped away.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS));

  out.uv = corner;
  out.packedId = packedId;
  return out;
}

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // Round dot: discard fragments outside the inscribed unit circle so the
  // clickable shape matches a round star, not the square quad.
  if (dot(in.uv, in.uv) > 1.0) { discard; }
  // r-channel carries the identity; g/b/a stay 0 (only r is read back).
  return vec4<u32>(in.packedId, 0u, 0u, 0u);
}
