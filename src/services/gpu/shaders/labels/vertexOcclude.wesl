// labels/vertexOcclude.wesl — the scene-attenuated MSDF labels vertex
// stage. It lives in its own module because a pipeline whose layout has no
// group(1) rejects a vertex module that statically uses 'lib::sceneDepth'
// bindings. The verdict is judged once at the subject, not at the lifted
// text, which can stand over other terrain.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
// 'uniforms' and 'labels' are imported, not redeclared: a second '@group(0)'
// binding here would conflict with vertex.wesl's declarations.
import package::labels::vertex::uniforms;
import package::labels::vertex::labels;
import package::labels::vertex::expandLabelQuad;
import package::labels::vertex::placeLabel;
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
