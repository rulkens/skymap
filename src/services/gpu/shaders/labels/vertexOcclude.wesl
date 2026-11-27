// labels/vertexOcclude.wesl — 'vertex.wesl' plus the sampled-depth verdict, in its
// own module: lib::sceneDepth statically pulls in group(1) bindings, which would
// break the plain pipeline's group(1)-less layout. A label is
// judged once at its subject, a leader at its bottom end. The cutoff is the
// subject's near surface, position minus radius; a grounded record (a sub-pixel
// subject on a body's ground, flagged by core) never reads depth.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
import package::labels::io::RECORD_GROUNDED;
import package::labels::vertex::recordUniforms;
import package::labels::vertex::records;
import package::labels::vertex::styleOf;
import package::labels::vertex::PlacedRecord;
import package::labels::vertex::placeRecord;
import package::labels::vertex::leaderSpanPx;
import package::labels::vertex::leaderDirection;
import package::labels::vertex::expandRecordGlyph;
import package::labels::vertex::expandRecordLeader;
import package::lib::sceneDepth::subjectDepthVerdictAtUv;

// Must equal 'SCALE_UNITS.MPC_TO_M × M_TO_KM' (src/data/scaleUnits.ts; labelRecord.parity).
const MPC_TO_KM: f32 = 3.0856775814913673e19;

fn depthVerdictAt(atPx: vec2<f32>, recordIndex: u32, placed: PlacedRecord) -> f32 {
  let record = records[recordIndex];
  if (!placed.subject.visible || (record.style & RECORD_GROUNDED) != 0u) {
    return 0.0;
  }
  let nearKm = (placed.distanceMpc - record.radiusMpc) * MPC_TO_KM;
  return subjectDepthVerdictAtUv(atPx / recordUniforms.out.sizePx, nearKm);
}

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let recordIndex = input.labelIndex;
  let style = styleOf(recordIndex);
  let placed = placeRecord(recordIndex, style);
  return expandRecordGlyph(input, recordIndex, style, placed, depthVerdictAt(placed.subject.px, recordIndex, placed));
}

@vertex
fn vsLeaderOcclude(@location(0) corner: vec2<f32>, @builtin(instance_index) recordIndex: u32) -> LeaderVsOut {
  let style = styleOf(recordIndex);
  let placed = placeRecord(recordIndex, style);
  let bottomPx = placed.subject.px + leaderDirection(placed) * leaderSpanPx(style, placed).x;
  return expandRecordLeader(corner, recordIndex, style, placed, depthVerdictAt(bottomPx, recordIndex, placed));
}
