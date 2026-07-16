// starCatalog/vertex.wesl — vertex-pull billboard stage for the survey
// (Gaia bin) stars.
//
// One instance = one octree record (a leaf star, or an interior node's
// flux-mip aggregate). The record is not a vertex attribute: it is PULLED
// from a per-source read-only storage blob at index 'firstRecord +
// instance_index', so the renderer uploads the record bytes once and the
// per-frame cost is just per-node draw calls, not a re-baked instance
// buffer. See the starCatalogRenderer module header for the storage /
// dynamic-offset discipline.
//
// ## Bindings
//
//   @group(0) @binding(0)  cam     CameraUniforms — the rebased,
//                                   camera-relative view-projection + viewport.
//   @group(1) @binding(0)  node    NodeParams (DYNAMIC OFFSET) — this draw's
//                                   octree node: box origin (camera-relative),
//                                   box scale, record-slice base, opacity.
//   @group(2) @binding(0)  records array<u32> — the source's whole record
//                                   blob, two u32 halves per 6-byte record.
//
// ## Record unpack (bit-for-bit the inverse of packStarRecord)
//
// The on-disk 6-byte record is two independent 24-bit halves (JS bitwise ops
// are signed-32, so the 48-bit field is never one integer — see
// starCatalogFormat.ts). The renderer repacks each record into two u32 at
// upload ('lo' = on-disk bytes 0..2, 'hi' = bytes 3..5), so here:
//
//   offsetX = lo bits  0..9        offsetY = lo bits 10..19
//   offsetZ = lo bits 20..23 (low 4) | hi bits 0..5 (high 6)   ← the split
//   absMagIdx = hi bits  6..12 (7)   colorIdx = hi bits 13..18 (6)
//
// The offsetZ straddle across the 24-bit boundary is the named trap: its low
// 4 bits ride in 'lo', its high 6 bits in 'hi'.
//
// ## World reconstruction (the precision seam's GPU half)
//
// starNodeOriginRelCamMpc already did the large-minus-large subtraction in
// f64 and handed us a small camera-relative origin, so here the f32 math is
// well-conditioned:
//
//   worldRelCam = originRelCamMpc + (offset / 1024) * cellScaleMpc
//
// ## Point size
//
// A placeholder absMag → pixel-radius ramp identical to bodies/starPoints —
// brighter star, bigger dot, no distance/flux term — SCALED by the user's
// live 'sizePx' setting (settings.starCatalogs.sizePx). The mirror of the
// galaxy points layer, where 'u.pointSizePx' is the base billboard size the
// per-record term modulates: here the base rides 'u.sizePx' and the ramp is
// its per-record modulation. Task 13 replaces the ramp with the real
// flux-based LOD once the survey bin is bringing up against live timings.

import package::starCatalog::io::VSOut;
import package::starCatalog::io::NodeParams;
import package::starCatalog::io::StarUniforms;
import package::starCatalog::tint::starTint;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;

@group(0) @binding(0) var<uniform> u: StarUniforms;
@group(1) @binding(0) var<uniform> node: NodeParams;
@group(2) @binding(0) var<storage, read> records: array<u32>;

// Magnitude / colour LUT dequant constants — mirror the frozen windows in
// src/data/starCatalog/starCatalogFormat.ts (LOCKED; consume, never diverge).
//   lutIndexToAbsMag(i) = STAR_ABSMAG_MIN + (i + 0.5) * STAR_ABSMAG_STEP
//   colorIdxToBpRp(i)   = STAR_COLORIDX_MIN + (i + 0.5) * STAR_COLORIDX_STEP
const STAR_ABSMAG_MIN: f32 = -6.0;
const STAR_ABSMAG_STEP: f32 = 0.19;
const STAR_COLORIDX_MIN: f32 = -0.6;
// STAR_COLORIDX_STEP = (STAR_COLORIDX_MAX - STAR_COLORIDX_MIN) / STAR_COLORIDX_LEVELS
//                    = (4.4 - (-0.6)) / 64 = 0.078125.
const STAR_COLORIDX_STEP: f32 = 0.078125;

// In-cell 10-bit offset unit: reciprocal of 1024 (offset 0..1023 spans one box).
const OFFSET_SCALE: f32 = 0.0009765625; // 1.0 / 1024.0

// Depth epsilon: pull the clamped clip-z this far inside the far plane so a
// point sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

// Reference star-dot size in px — mirrors DEFAULT_STAR_SIZE_PX
// (src/data/defaults.ts; consume, never diverge). Dividing the user's
// 'u.sizePx' by it makes the DEFAULT setting reproduce the placeholder ramp
// unscaled (identity), so the ramp's tuned look is preserved at the default
// and only slider movement away from it rescales the whole starfield.
const STAR_SIZE_REF_PX: f32 = 2.5;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  // Vertex-pull this instance's record: 'firstInstance' stays 0, so
  // 'instance_index' is the in-node record index; the base offset is the
  // node's slice start. Two u32 per record in the repacked blob.
  let base = node.firstRecord + ii;
  let lo = records[base * 2u + 0u];
  let hi = records[base * 2u + 1u];

  // Unpack — bit-for-bit unpackStarRecord. offsetZ's low 4 bits from 'lo',
  // high 6 bits from 'hi'.
  let ox = f32(lo & 0x3ffu);
  let oy = f32((lo >> 10u) & 0x3ffu);
  let oz = f32(((lo >> 20u) & 0xfu) | ((hi & 0x3fu) << 4u));
  let absMagIdx = (hi >> 6u) & 0x7fu;
  let colorIdx = (hi >> 13u) & 0x3fu;

  // World position, camera-relative (the f64 rebase already happened CPU-side).
  let offset = vec3<f32>(ox, oy, oz) * OFFSET_SCALE;
  let worldRelCam = node.originRelCamMpc + offset * node.cellScaleMpc;

  let center = worldToClip(u.cam, worldRelCam);
  let corner = triCorner(vi);

  // Dequant absolute magnitude (bin centre), then the placeholder legibility
  // ramp — brighter (lower absMag) → bigger dot — scaled by the user's base
  // star-dot size. 'u.sizePx / STAR_SIZE_REF_PX' is 1.0 at the default, so the
  // ramp is the per-record modulation of the 'u.sizePx' base (the galaxy
  // pointSizePx mirror), and the live slider rescales every star's dot.
  let absMag = STAR_ABSMAG_MIN + (f32(absMagIdx) + 0.5) * STAR_ABSMAG_STEP;
  let ramp = clamp(6.0 - 0.45 * absMag, 1.5, 8.0);
  let sizePx = ramp * (u.sizePx / STAR_SIZE_REF_PX);

  let screenOffset = expandBillboardScreen(u.cam, center, sizePx, corner);

  var out: VSOut;
  out.clip = center + vec4<f32>(screenOffset, 0.0, 0.0);

  // Survive the adaptive foreground far plane on a deep descent — identical to
  // bodies/starPoints. Safe ONLY because this is the depthless additive HDR
  // pass (no depth test/write), so clamping clip-z perturbs no depth compare.
  out.clip.z = min(out.clip.z, out.clip.w * (1.0 - CLIP_Z_EPS));

  out.uv = corner;

  // Dequant BP−RP colour (bin centre) → stellar spectral tint.
  let bpRp = STAR_COLORIDX_MIN + (f32(colorIdx) + 0.5) * STAR_COLORIDX_STEP;
  out.color = starTint(bpRp);
  out.opacity = node.opacity;
  return out;
}
