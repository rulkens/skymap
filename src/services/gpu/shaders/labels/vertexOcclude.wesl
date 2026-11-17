// labels/vertexOcclude.wesl — the scene-attenuated MSDF labels vertex
// stage. It lives in its own module because a pipeline whose layout has no
// group(1) rejects a vertex module that statically uses 'lib::sceneDepth'
// bindings. A label's verdict is judged once at the subject, not at the
// lifted text, which can stand over other terrain; a leader's at its bottom end.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
import package::labels::io::LeaderVsOut;
// 'uniforms' and 'labels' are imported, not redeclared: a second '@group(0)'
// binding here would conflict with vertex.wesl's declarations.
import package::labels::vertex::uniforms;
import package::labels::vertex::labels;
import package::labels::vertex::expandLabelQuad;
import package::labels::vertex::placeLabel;
import package::labels::vertex::expandLeaderQuad;
import package::labels::vertex::leaderSpanPx;
import package::lib::sceneDepth::subjectDepthVerdictAtUv;

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let placed = placeLabel(label);
  var verdict = 0.0;
  if (placed.subject.visible) {
    verdict = subjectDepthVerdictAtUv(placed.subject.px / uniforms.out.sizePx, label.occludeNearKm);
  }
  return expandLabelQuad(input, label, placed, max(label.occludeWeight, verdict));
}

@vertex
fn vsLeaderOcclude(@location(0) corner: vec2<f32>, @builtin(instance_index) labelIndex: u32) -> LeaderVsOut {
  let label = labels[labelIndex];
  let placed = placeLabel(label);
  var verdict = 0.0;
  if (placed.subject.visible) {
    let bottomPx = placed.subject.px + placed.subject.up * leaderSpanPx(label, placed).x;
    verdict = subjectDepthVerdictAtUv(bottomPx / uniforms.out.sizePx, label.occludeNearKm);
  }
  return expandLeaderQuad(corner, label, placed, max(label.occludeWeight, verdict));
}
