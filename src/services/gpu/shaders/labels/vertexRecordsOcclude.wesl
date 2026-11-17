// labels/vertexRecordsOcclude.wesl — 'vertexRecords.wesl' plus the sampled-depth
// verdict, in its own module for the reason vertexOcclude.wesl gives (its
// lib::sceneDepth bindings would break the plain pipeline's layout). A label is
// judged once at its subject, a leader at its bottom end. The cutoff is the
// subject's near surface, position minus radius; a grounded record (a sub-pixel
// subject on a body's ground, flagged by core) never reads depth.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
import package::labels::io::LabelRecord;
import package::labels::io::RECORD_GROUNDED;
import package::labels::vertexRecords::recordUniforms;
import package::labels::vertexRecords::records;
import package::labels::vertexRecords::styleOf;
import package::labels::vertexRecords::PlacedRecord;
import package::labels::vertexRecords::placeRecord;
import package::labels::vertexRecords::leaderSpanPx;
import package::labels::vertexRecords::leaderDirection;
import package::labels::vertexRecords::expandRecordGlyph;
import package::labels::vertexRecords::expandRecordLeader;
import package::lib::sceneDepth::subjectDepthVerdictAtUv;

// Must equal 'SCALE_UNITS.MPC_TO_M × M_TO_KM' (src/data/scaleUnits.ts).
const MPC_TO_KM: f32 = 3.0856775814913673e19;

fn depthVerdictAt(atPx: vec2<f32>, record: LabelRecord, placed: PlacedRecord) -> f32 {
  if (!placed.subject.visible || (record.style & RECORD_GROUNDED) != 0u) {
    return 0.0;
  }
  let nearKm = (placed.distanceMpc - record.radiusMpc) * MPC_TO_KM;
  return subjectDepthVerdictAtUv(atPx / recordUniforms.out.sizePx, nearKm);
}

@vertex
fn vsRecordsOcclude(input: VsIn) -> VsOut {
  let record = records[input.labelIndex];
  let style = styleOf(record);
  let placed = placeRecord(record, style);
  return expandRecordGlyph(input, record, style, placed, depthVerdictAt(placed.subject.px, record, placed));
}

@vertex
fn vsRecordLeadersOcclude(@location(0) corner: vec2<f32>, @builtin(instance_index) recordIndex: u32) -> LeaderVsOut {
  let record = records[recordIndex];
  let style = styleOf(record);
  let placed = placeRecord(record, style);
  let bottomPx = placed.subject.px + leaderDirection(placed) * leaderSpanPx(style, placed).x;
  return expandRecordLeader(corner, record, style, placed, depthVerdictAt(bottomPx, record, placed));
}
