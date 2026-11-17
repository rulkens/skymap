// labels/vertexOcclude.wesl — the scene-attenuated MSDF labels vertex
// stage. It lives in its own module because a pipeline whose layout has no
// group(1) rejects a vertex module that statically uses 'lib::sceneDepth'
// bindings. The verdict is judged once at 'label.subjectPos', the
// pre-lift point, since the lifted anchor can stand over other terrain.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
// 'uniforms' and 'labels' are imported, not redeclared: a second '@group(0)
// @binding(0)' here would conflict with vertex.wesl's existing declaration.
import package::labels::vertex::uniforms;
import package::labels::vertex::labels;
import package::labels::vertex::expandLabelQuad;
import package::labels::vertex::viewOfSlabPoint;
import package::lib::projectLabel::projectLabel;
import package::lib::sceneDepth::subjectDepthVerdictAtUv;

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let subject = projectLabel(viewOfSlabPoint(label.subjectPos.xyz), uniforms.out);
  var verdict = 0.0;
  if (subject.visible) {
    verdict = subjectDepthVerdictAtUv(subject.px / uniforms.out.sizePx, label.occludeNearKm);
  }
  return expandLabelQuad(input, label, max(label.occludeWeight, verdict));
}
