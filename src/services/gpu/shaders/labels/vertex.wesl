// labels/vertex.wesl — MSDF labels vertex stage.
//
// Projects the subject through 'lib/projectLabel.wesl', lifts a lifted label's
// anchor up the image by 'labelLiftPx', and expands the unit-corner attribute
// into a glyph quad in output px, along the projected image-up and its
// perpendicular, written as NDC at w = 1.  'worldEmMpc' (label.worldPos.w) is
// the em height in Mpc of world space; it becomes an angle at the subject's
// distance, then px, clamped to [minPx, maxPx].
//
// ## Quad expansion for the outline fringe
//
// When a label sets 'outlineEmFrac', the on-screen footprint extends
// past the atlas rect by 'outlineEmFrac * displayEmPx' screen pixels.
// If the quad stays sized to the atlas rect, the outline clips at the
// glyph's bounding box.  We grow each corner outward by the fringe
// expressed in atlas px; the UV expansion below extrapolates past the
// glyph's atlas rect so the fragment shader can sample the SDF tail.

import package::labels::io::Uniforms;
import package::labels::io::LabelData;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::labels::io::LIFT_NONE;
import package::labels::io::LIFT_LEADER_FROM_RIM;
import package::labels::io::LeaderVsOut;
import package::lib::projectLabel::ProjectedLabel;
import package::lib::projectLabel::projectLabel;
import package::lib::projectLabel::scaledLength;

// Atlas em pixel size — must match 'ATLAS_FONT_SIZE' in src/data/fonts.ts.
const ATLAS_EM_PX: f32 = 84.0;
// MSDF distance range in pixels — must match 'DISTANCE_RANGE_PX' in
// src/data/fonts.ts.  Sets the SDF's encoded headroom past the glyph
// contour; tighter ranges clamp the tail and produce banded edges.
const DISTANCE_RANGE_PX: f32 = 32.0;
// Behind the near plane on every corner: a hidden label rasterises nothing.
const HIDDEN_POS: vec4<f32> = vec4<f32>(0.0, 0.0, -1.0, 1.0);
// Must equal the constants of the same names in leaderLineStyle.ts.
const MIN_LABEL_CLEARANCE_PX: f32 = 28.0;
const LEADER_LIFT_FACTOR: f32 = 1.5;
const LEADER_LINE_PADDING_PX: f32 = 6.0;

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> labels: array<LabelData>;

fn viewOfSlabPoint(slabPos: vec3<f32>) -> vec3<f32> {
  return (uniforms.viewFromSlab * vec4<f32>(slabPos, 1.0)).xyz;
}

// The twin of 'utils/labels/labelLiftPx.ts'.
fn labelLiftPx(subjectSizePx: f32, inkDropPx: f32) -> f32 {
  return max(
    max(MIN_LABEL_CLEARANCE_PX, LEADER_LIFT_FACTOR * subjectSizePx),
    MIN_LABEL_CLEARANCE_PX + inkDropPx,
  );
}

// A label placed for this frame: its subject on the image, its em in px, the
// subject's apparent diameter and how far the text anchor sits above it.
struct PlacedLabel {
  subject: ProjectedLabel,
  displayEmPx: f32,
  subjectSizePx: f32,
  liftPx: f32,
};

fn placeLabel(label: LabelData) -> PlacedLabel {
  let viewVec = viewOfSlabPoint(label.worldPos.xyz);
  var subject: ProjectedLabel = projectLabel(viewVec, uniforms.out);
  subject.visible = subject.visible && viewVec.z >= uniforms.nearClipMpc;
  let distance = scaledLength(viewVec);
  // The em as an angle at the subject, then px; packLabels already folded the
  // em retune in, as the CPU twin 'labelDisplayEmPx' applies it. A lifted
  // label's text shares its subject's view depth, so its em is the same.
  let pxPerEm = label.worldPos.w / distance * subject.pxPerRad;
  let displayEmPx = clamp(pxPerEm, label.sizing.y, label.sizing.z);
  // On the axis's scale, as the CPU's 'apparentSizePx' reads it.
  let subjectSizePx = 2.0 * label.radiusMpc / distance * uniforms.out.focalPx;
  var liftPx = 0.0;
  if (label.lift != LIFT_NONE) {
    liftPx = labelLiftPx(subjectSizePx, label.inkBottom * displayEmPx / ATLAS_EM_PX);
  }
  return PlacedLabel(subject, displayEmPx, subjectSizePx, liftPx);
}

// A leader's ends, px up the image from the subject: from its gap above the
// rim (or the centre) to LEADER_LINE_PADDING_PX under the text's ink bottom.
// The line is drawn only while that leaves it room (x < y).
fn leaderSpanPx(label: LabelData, placed: PlacedLabel) -> vec2<f32> {
  let inkDropPx = label.inkBottom * placed.displayEmPx / ATLAS_EM_PX;
  let rimPx = select(0.0, placed.subjectSizePx * 0.5, label.lift == LIFT_LEADER_FROM_RIM);
  return vec2<f32>(rimPx + label.leaderGapPx, placed.liftPx - inkDropPx - LEADER_LINE_PADDING_PX);
}

// expandLeaderQuad — one leader corner: corner.x runs bottom to top, corner.y
// across the width. Shared by 'vsLeader' and 'vsLeaderOcclude', as
// 'expandLabelQuad' is by the glyph entries.
fn expandLeaderQuad(corner: vec2<f32>, label: LabelData, placed: PlacedLabel, occludeWeight: f32) -> LeaderVsOut {
  let span = leaderSpanPx(label, placed);
  let drawn = placed.subject.visible && label.lift != LIFT_NONE && label.leaderWidthPx > 0.0 && span.y > span.x;
  let up = placed.subject.up;
  let across = vec2<f32>(-up.y, up.x);
  let leaderPx = placed.subject.px + up * mix(span.x, span.y, corner.x)
    + across * (corner.y - 0.5) * label.leaderWidthPx;
  let sizePx = uniforms.out.sizePx;
  let ndc = vec2<f32>(leaderPx.x / sizePx.x * 2.0 - 1.0, 1.0 - leaderPx.y / sizePx.y * 2.0);
  return LeaderVsOut(
    select(HIDDEN_POS, vec4<f32>(ndc, 0.5, 1.0), drawn),
    corner.y,
    unpack4x8unorm(label.leaderRgba) * label.sizing.w,
    occludeWeight,
  );
}

// expandLabelQuad — the quad-expansion body shared by 'vs' (this file) and
// 'vsOcclude' (vertexOcclude.wesl). Takes the RESOLVED occlude weight as a
// parameter rather than reading 'label.occludeWeight' itself: 'vsOcclude'
// resolves it beforehand by folding in a subject-depth verdict against
// group(1) bindings this module must stay clear of (see vertexOcclude.wesl's
// header for why). One definition of the corner math either way.
fn expandLabelQuad(input: VsIn, label: LabelData, placed: PlacedLabel, occludeWeight: f32) -> VsOut {
  let outlineEmFrac  = label.sizing.x;
  let fadeAlpha      = label.sizing.w;

  var anchor = placed.subject;
  anchor.px += anchor.up * placed.liftPx;
  let atlasToPx = placed.displayEmPx / ATLAS_EM_PX;

  // Outline fringe in atlas px.  The on-screen fringe is
  // 'outlineEmFrac * displayEmPx' screen pixels, which divides by
  // atlasToPx to recover atlas-px (because the same atlasToPx is applied
  // to the corner offset below).
  let fringeAtlasPx = outlineEmFrac * ATLAS_EM_PX;

  // Expand each corner outward by the fringe.  The unit-corner attribute
  // sits in {(0,0),(1,0),(0,1),(1,1)}; remap to {-1,+1} via (corner*2-1)
  // to get an outward direction, then add 'corner*localSize' for the
  // glyph rect, and 'direction*fringeAtlasPx' for the fringe extension.
  let outward = input.corner * 2.0 - vec2<f32>(1.0, 1.0);
  // Atlas +y runs down the glyph, the opposite of image-up.
  let cornerAtlasPx = vec2<f32>(
    input.localOffset.x + input.corner.x * input.localSize.x + outward.x * fringeAtlasPx,
    input.localOffset.y + input.corner.y * input.localSize.y + outward.y * fringeAtlasPx,
  );
  let across = vec2<f32>(-anchor.up.y, anchor.up.x);
  let cornerPx = anchor.px + (across * cornerAtlasPx.x - anchor.up * cornerAtlasPx.y) * atlasToPx;
  let sizePx = uniforms.out.sizePx;
  let ndc = vec2<f32>(cornerPx.x / sizePx.x * 2.0 - 1.0, 1.0 - cornerPx.y / sizePx.y * 2.0);
  // Mid-depth: the label pass is a depthless OVER composite, so no plane clips it.
  let outPos = select(HIDDEN_POS, vec4<f32>(ndc, 0.5, 1.0), anchor.visible);

  // UV expansion to match the corner expansion.  The UV rect coordinates
  // are already normalised; the fringe in atlas px maps to UV space via
  // '(uvSpan / localSize)'.  The result samples outside the glyph's
  // atlas rect at the fringe — the distance-only region past the glyph
  // contour, which is where the outline band lives.
  let uvSpanX = input.uvRect.z - input.uvRect.x;
  let uvSpanY = input.uvRect.w - input.uvRect.y;
  let uvBase = vec2<f32>(
    mix(input.uvRect.x, input.uvRect.z, input.corner.x),
    mix(input.uvRect.y, input.uvRect.w, input.corner.y),
  );
  let uvFringe = vec2<f32>(
    outward.x * fringeAtlasPx * uvSpanX / max(input.localSize.x, 0.0001),
    outward.y * fringeAtlasPx * uvSpanY / max(input.localSize.y, 0.0001),
  );
  let uv = uvBase + uvFringe;

  // Pre-bake fadeAlpha into every colour channel that flows to the
  // fragment stage.  The fragment stage then just multiplies by the
  // per-band SDF coverage, so fadeAlpha applies uniformly to fill and
  // outline without an extra fragment-side multiply.
  let outColor        = vec4<f32>(label.color.rgb        * fadeAlpha, label.color.a        * fadeAlpha);
  let outOutlineColor = vec4<f32>(label.outlineColor.rgb * fadeAlpha, label.outlineColor.a * fadeAlpha);

  // Convert em-fraction outline width to SDF units:
  //   widthInSdfUnits = (frac * ATLAS_EM_PX) / DISTANCE_RANGE_PX
  let outlineSdf = outlineEmFrac * ATLAS_EM_PX / DISTANCE_RANGE_PX;

  return VsOut(
    outPos,
    uv,
    outColor,
    input.fontIndex,
    outOutlineColor,
    outlineSdf,
    occludeWeight,
  );
}

@vertex
fn vs(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  return expandLabelQuad(input, label, placeLabel(label), label.occludeWeight);
}

// One leader per label, instanced over the label buffer.
@vertex
fn vsLeader(@location(0) corner: vec2<f32>, @builtin(instance_index) labelIndex: u32) -> LeaderVsOut {
  let label = labels[labelIndex];
  return expandLeaderQuad(corner, label, placeLabel(label), label.occludeWeight);
}
