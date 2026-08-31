// labels/pick.wesl — the pick twin of the MSDF label pass: one flat
// screen-space rectangle per legible label, stamping the label subject's
// packed identity into the r32uint pick target.
//
// The rect arrives ALREADY in device pixels ('labelScreenRect' on the CPU —
// the same measured-ink + em-clamp math the COSMO declutter runs), so nothing
// is projected here; the vertex stage only maps px -> NDC. A shader-side
// second copy of that clamp is precisely the drift the shared CPU helper
// exists to prevent. It is also why this is not 'lib/billboard's
// 'expandBillboardScreen': that expands a uniform radius about a projected
// centre, and a line of text is an asymmetric box about its anchor.
//
// ## Two vertex entries, one per slab depth convention
//
// A label is a UI affordance painted over everything, so its quad must WIN its
// pixel against the geometry behind it — which is the opposite depth extreme
// on the two slabs: 'vs' for COSMO (classic, smaller-z wins, cleared to 1) and
// 'vsReversed' for NEAR0 (reversed-Z, greater-z wins, cleared to 0). Both sit
// LABEL_PICK_BAND_EPS inside the winning end rather than exactly on it, so the
// fragment stays strictly within the clip range and no exact-depth tie against
// a fragment pinned to the plane has to be broken.
//
// Every label in a pass shares its band, and the depth test rejects EQUAL, so
// the FIRST instance drawn wins a contested pixel — 'labelPickQuads' emits
// them nearest-subject-first for that reason.
//
// ## Attribute layout (stepMode 'instance', stride 20 bytes)
//
//   @location(0) rectPx:   vec4<f32>  — (x0, y0, x1, y1) device px, +Y DOWN
//   @location(1) packedId: u32        — the subject's fully-packed pick id

import package::lib::billboard::quadCorner;
import package::lib::billboard::quadUv;

struct LabelPickUniforms {
  viewportPx: vec2<f32>,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> u: LabelPickUniforms;

// Distance from the winning end of the depth range — see the header. Far
// coarser than depth32float/depth24plus resolve at either extreme, so the band
// can never collapse onto the clear value.
const LABEL_PICK_BAND_EPS: f32 = 1e-4;

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  // Integer varyings must be flat.
  @location(0) @interpolate(flat) packedId: u32,
};

// Corner 'vi' of the pixel rect, in NDC. 'quadUv' gives [0,1]^2 in the same
// corner order the six-vertex triangle list uses; +Y down in px becomes +Y up
// in NDC via the 1 - t flip.
fn rectCornerNdc(vi: u32, rectPx: vec4<f32>) -> vec2<f32> {
  let px = mix(rectPx.xy, rectPx.zw, quadUv(vi));
  return vec2<f32>(px.x / u.viewportPx.x * 2.0 - 1.0, 1.0 - px.y / u.viewportPx.y * 2.0);
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) rectPx: vec4<f32>,
  @location(1) packedId: u32,
) -> VSOut {
  var out: VSOut;
  // w = 1, so z IS z/w: the band value lands in NDC depth unchanged.
  out.clip = vec4<f32>(rectCornerNdc(vi, rectPx), LABEL_PICK_BAND_EPS, 1.0);
  out.packedId = packedId;
  return out;
}

@vertex
fn vsReversed(
  @builtin(vertex_index) vi: u32,
  @location(0) rectPx: vec4<f32>,
  @location(1) packedId: u32,
) -> VSOut {
  var out: VSOut;
  out.clip = vec4<f32>(rectCornerNdc(vi, rectPx), 1.0 - LABEL_PICK_BAND_EPS, 1.0);
  out.packedId = packedId;
  return out;
}

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // No discard: the clickable shape IS the rectangle (the grace box around the
  // ink), not a glyph-accurate mask. r carries the identity; g/b/a stay 0.
  return vec4<u32>(in.packedId, 0u, 0u, 0u);
}
