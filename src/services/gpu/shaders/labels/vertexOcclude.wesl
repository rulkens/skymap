// labels/vertexOcclude.wesl — the scene-attenuated MSDF labels vertex
// stage. It lives in its own module because a pipeline whose layout has no
// group(1) rejects a vertex module that statically uses 'lib::sceneDepth'
// bindings. The verdict is judged once at 'label.subjectPos', the
// pre-lift point, since the lifted anchor can stand over other terrain.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
// 'u' and 'labels' are imported, not redeclared: a second '@group(0)
// @binding(0)' here would conflict with vertex.wesl's existing declaration.
import package::labels::vertex::u;
import package::labels::vertex::labels;
import package::labels::vertex::expandLabelQuad;
import package::lib::camera::worldToClip;
import package::lib::sceneDepth::depthFrame;
import package::lib::sceneDepth::sceneDepthOccludes;

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let clip = worldToClip(u.cam, label.subjectPos.xyz);

  var verdict = 0.0;
  if (clip.w > 0.0) {
    let ndc = clip.xy / clip.w;
    // Framebuffer y points DOWN; ndc.y points UP.
    let anchorXY = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * depthFrame.viewportPx;
    // Guard explicitly rather than lean on textureLoad's out-of-bounds
    // return: FAR_DEPTH is 0 and so is an out-of-bounds load on the
    // backends this targets, a coincidence nothing should lean on — WGSL
    // does not pin what an out-of-bounds load returns.
    if (
      anchorXY.x >= 0.0 && anchorXY.x < depthFrame.viewportPx.x &&
      anchorXY.y >= 0.0 && anchorXY.y < depthFrame.viewportPx.y
    ) {
      verdict = sceneDepthOccludes(anchorXY, label.occludeNearKm);
    }
  }

  return expandLabelQuad(input, label, max(label.occludeWeight, verdict));
}
