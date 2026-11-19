// labels/vertexOccludeMask.wesl — 'vertexOcclude.wesl' with the verdict read
// from an occlusion mask instead of the sampled depth: the same question (is
// the scene nearer than the subject's near surface, at the subject's px; a
// leader at its bottom end), asked of a mask already on the output image. Its
// own module for the reason 'vertexOcclude.wesl' gives: group(1) differs.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
import package::labels::io::LabelRecord;
import package::labels::io::RECORD_GROUNDED;
import package::labels::vertex::records;
import package::labels::vertex::styleOf;
import package::labels::vertex::PlacedRecord;
import package::labels::vertex::placeRecord;
import package::labels::vertex::leaderSpanPx;
import package::labels::vertex::leaderDirection;
import package::labels::vertex::expandRecordGlyph;
import package::labels::vertex::expandRecordLeader;
import package::labels::vertexOcclude::MPC_TO_KM;
import package::lib::occlusionMask::maskOccludes;

fn maskVerdictAt(atPx: vec2<f32>, record: LabelRecord, placed: PlacedRecord) -> f32 {
  if (!placed.subject.visible || (record.style & RECORD_GROUNDED) != 0u) {
    return 0.0;
  }
  return maskOccludes(atPx, (placed.distanceMpc - record.radiusMpc) * MPC_TO_KM);
}

@vertex
fn vsOccludeMask(input: VsIn) -> VsOut {
  let record = records[input.labelIndex];
  let style = styleOf(record);
  let placed = placeRecord(record, style);
  return expandRecordGlyph(input, record, style, placed, maskVerdictAt(placed.subject.px, record, placed));
}

@vertex
fn vsLeaderOccludeMask(@location(0) corner: vec2<f32>, @builtin(instance_index) recordIndex: u32) -> LeaderVsOut {
  let record = records[recordIndex];
  let style = styleOf(record);
  let placed = placeRecord(record, style);
  let bottomPx = placed.subject.px + leaderDirection(placed) * leaderSpanPx(style, placed).x;
  return expandRecordLeader(corner, record, style, placed, maskVerdictAt(bottomPx, record, placed));
}
