// labels/vertex.wesl — the label vertex stage over 'LabelRecord's, the
// records core encodes from Layers' label sources. The record's absolute hi/lo
// position minus the camera's pair gives the view vector, exact near the camera,
// so no slab matrix is needed. An 'above' style stands its text on
// 'liftedAnchor' (alignY bottom, so the lift alone clears the subject); text
// height is the style's em over the subject's distance, at the subject's own
// pixels per radian, clamped to LABEL_TEXT_PX (the CPU twin is 'projectRecords'). Hover and select whiten the
// colour here, by pick word, so only alpha changes per frame on the CPU.

import package::labels::io::RecordUniforms;
import package::labels::io::LabelRecord;
import package::labels::io::LabelStyle;
import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
import package::labels::io::STYLE_INDEX_MASK;
import package::labels::io::STYLE_ABOVE;
import package::labels::io::STYLE_LEADER_FROM_RIM;
import package::labels::io::STYLE_LEADER_COLOR;
import package::lib::projectLabel::ProjectedLabel;
import package::lib::projectLabel::projectLabel;
import package::lib::projectLabel::liftedAnchor;
import package::lib::projectLabel::labelCornerPx;
import package::lib::projectLabel::scaledLength;

// Must match 'ATLAS_FONT_SIZE' and 'DISTANCE_RANGE_PX' in src/data/fonts.ts
// (fontConstants.parity).
const ATLAS_EM_PX: f32 = 84.0;
const DISTANCE_RANGE_PX: f32 = 32.0;
// Gap between a leader's far end and the text's ink bottom; no CPU twin (pick rects omit leaders).
const LEADER_LINE_PADDING_PX: f32 = 3.0;
// Behind the near plane on every corner: a hidden label rasterises nothing.
const HIDDEN_POS: vec4<f32> = vec4<f32>(0.0, 0.0, -1.0, 1.0);

@group(0) @binding(0) var<uniform> recordUniforms: RecordUniforms;
@group(0) @binding(1) var<storage, read> records: array<LabelRecord>;
@group(0) @binding(4) var<storage, read> styles: array<LabelStyle>;

// One record placed for this frame. 'color' is straight rgba, highlight applied.
struct PlacedRecord {
  subject: ProjectedLabel,
  anchor: ProjectedLabel,
  distanceMpc: f32,
  textPx: f32,
  diameterPx: f32,
  color: vec4<f32>,
  drawn: bool,
};

fn styleOf(record: LabelRecord) -> LabelStyle {
  return styles[record.style & STYLE_INDEX_MASK];
}

fn placeRecord(record: LabelRecord, style: LabelStyle) -> PlacedRecord {
  let projection = recordUniforms.out;
  let viewVec = projection.viewFromWorld
    * ((record.atHi - projection.camHi) + (record.atLo - projection.camLo));
  let subject = projectLabel(viewVec, projection);
  var anchor = subject;
  if ((style.flags & STYLE_ABOVE) != 0u) {
    anchor = liftedAnchor(viewVec, record.radiusMpc, style.liftRadii, style.liftMinPx, projection);
  }
  let distanceMpc = scaledLength(viewVec);
  let emMpc = style.emMpc + style.emTimesRadius * record.radiusMpc;
  let textPx = clamp(
    emMpc / distanceMpc * subject.pxPerRad * recordUniforms.emRetune,
    recordUniforms.minTextPx,
    recordUniforms.maxTextPx,
  );
  let diameterPx = select(0.0, 2.0 * record.radiusMpc / distanceMpc * projection.focalPx, distanceMpc > 0.0);

  var color = select(style.color, unpack4x8unorm(record.tint), record.tint != 0u);
  var whiten = 0.0;
  if (record.pick != 0u && record.pick == recordUniforms.hoveredPick) {
    whiten = recordUniforms.hoveredWhiten;
  }
  // Selected wins over hovered: the stronger cue.
  if (record.pick != 0u && record.pick == recordUniforms.selectedPick) {
    whiten = recordUniforms.selectedWhiten;
  }
  color = vec4<f32>(mix(color.rgb, vec3<f32>(1.0), whiten), color.a);
  let drawn = subject.visible && anchor.visible && record.alpha > 0.0;
  return PlacedRecord(subject, anchor, distanceMpc, textPx, diameterPx, color, drawn);
}

fn premultiplied(color: vec4<f32>, alpha: f32) -> vec4<f32> {
  return vec4<f32>(color.rgb * color.a * alpha, color.a * alpha);
}

fn ndcOf(atPx: vec2<f32>) -> vec4<f32> {
  let sizePx = recordUniforms.out.sizePx;
  return vec4<f32>(atPx.x / sizePx.x * 2.0 - 1.0, 1.0 - atPx.y / sizePx.y * 2.0, 0.5, 1.0);
}

// The leader's ends, px from the subject toward the text: from the gap above the
// rim (or the centre) to LEADER_LINE_PADDING_PX under the text's ink bottom,
// which an 'above' label's anchor is. x >= y means no room for a line.
fn leaderSpanPx(style: LabelStyle, placed: PlacedRecord) -> vec2<f32> {
  let pxScale = recordUniforms.out.pxScale;
  let rimPx = select(0.0, placed.diameterPx * 0.5, (style.flags & STYLE_LEADER_FROM_RIM) != 0u);
  let lengthPx = distance(placed.anchor.px, placed.subject.px);
  return vec2<f32>(rimPx + style.leaderGapPx * pxScale, lengthPx - LEADER_LINE_PADDING_PX * pxScale);
}

// Unit direction from the subject to the text on screen; image-up when they coincide.
fn leaderDirection(placed: PlacedRecord) -> vec2<f32> {
  let toAnchor = placed.anchor.px - placed.subject.px;
  let lengthPx = length(toAnchor);
  return select(placed.subject.up, toAnchor / lengthPx, lengthPx > 0.0);
}

fn expandRecordLeader(corner: vec2<f32>, record: LabelRecord, style: LabelStyle, placed: PlacedRecord, occludeWeight: f32) -> LeaderVsOut {
  let span = leaderSpanPx(style, placed);
  let drawn = placed.drawn && style.leaderWidthPx > 0.0 && span.y > span.x;
  let along = leaderDirection(placed);
  let across = vec2<f32>(-along.y, along.x);
  let leaderPx = placed.subject.px + along * mix(span.x, span.y, corner.x)
    + across * (corner.y - 0.5) * style.leaderWidthPx * recordUniforms.out.pxScale;
  let color = select(placed.color, style.leaderColor, (style.flags & STYLE_LEADER_COLOR) != 0u);
  return LeaderVsOut(
    select(HIDDEN_POS, ndcOf(leaderPx), drawn),
    corner.y,
    premultiplied(color, record.alpha),
    occludeWeight,
  );
}

// One glyph corner, grown outward by the outline fringe so the outline doesn't clip
// at the glyph's box; the UV extrapolates past the atlas rect into the SDF tail.
fn expandRecordGlyph(input: VsIn, record: LabelRecord, style: LabelStyle, placed: PlacedRecord, occludeWeight: f32) -> VsOut {
  let anchor = placed.anchor;
  let atlasToPx = placed.textPx / ATLAS_EM_PX;
  let fringeAtlasPx = style.outlineEmFrac * ATLAS_EM_PX;
  let outward = input.corner * 2.0 - vec2<f32>(1.0, 1.0);
  let cornerAtlasPx = input.localOffset + input.corner * input.localSize + outward * fringeAtlasPx;
  // Atlas +y runs down the glyph, the opposite of the label's up.
  let offsetPx = vec2<f32>(cornerAtlasPx.x, -cornerAtlasPx.y) * atlasToPx;
  let cornerPx = labelCornerPx(anchor, offsetPx, recordUniforms.out);

  let uvSpan = input.uvRect.zw - input.uvRect.xy;
  let uvBase = mix(input.uvRect.xy, input.uvRect.zw, input.corner);
  let uvFringe = outward * fringeAtlasPx * uvSpan / max(input.localSize, vec2<f32>(0.0001));

  return VsOut(
    select(HIDDEN_POS, ndcOf(cornerPx), placed.drawn),
    uvBase + uvFringe,
    premultiplied(placed.color, record.alpha),
    input.fontIndex,
    premultiplied(style.outlineColor, record.alpha),
    style.outlineEmFrac * ATLAS_EM_PX / DISTANCE_RANGE_PX,
    occludeWeight,
  );
}

@vertex
fn vs(input: VsIn) -> VsOut {
  let record = records[input.labelIndex];
  let style = styleOf(record);
  return expandRecordGlyph(input, record, style, placeRecord(record, style), 0.0);
}

// One leader per record, instanced over the record buffer.
@vertex
fn vsLeader(@location(0) corner: vec2<f32>, @builtin(instance_index) recordIndex: u32) -> LeaderVsOut {
  let record = records[recordIndex];
  let style = styleOf(record);
  return expandRecordLeader(corner, record, style, placeRecord(record, style), 0.0);
}
