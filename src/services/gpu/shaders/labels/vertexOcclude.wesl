// labels/vertexOcclude.wesl — the scene-attenuated variant of the MSDF
// labels vertex stage, mirroring fragmentOcclude.wesl's role one stage
// earlier.
//
// This is a SEPARATE module from vertex.wesl, not a branch inside 'vs',
// because importing 'lib::sceneDepth' hoists its group(1) bindings into
// whichever module calls into it — the plain pipeline's layout has no
// group(1), so a vertex module that statically references those bindings
// fails pipeline creation on a device. 'vs' (vertex.wesl) must therefore
// never import this file's dependencies; 'vsOcclude' here is the only vertex
// entry allowed to.
//
// ## Why the verdict moves here from the fragment stage
//
// Task 10's fragment-stage channel sampled scene depth under every rendered
// TEXT pixel. A caption is lifted screen-up from its subject with a leader
// line (label2DDirector's applyLift); where that lift lands can be tens of
// km of relief away from the subject itself (Mars' limb bulges toward the
// camera in exactly the "up" direction a caption lifts toward), so glyphs at
// one end of a caption could sample nearer terrain than glyphs at the other
// — a caption cut in half instead of shown or hidden as a whole. Judging the
// verdict ONCE per label, here, at its own anchor (the same worldPos 'vs'
// already projects for placement) replaces N per-pixel samples with one,
// so a caption is either fully shown or fully hidden — see
// lib/sceneDepth.wesl's 'sceneDepthOccludes' doc for the occluder-channel
// contract this folds in.

import package::labels::io::VsIn;
import package::labels::io::VsOut;
// 'u' and 'labels' are imported, not redeclared: vertex.wesl already binds
// group(0) 0/1, and 'expandLabelQuad' below pulls that same declaration into
// this linked module — a second '@group(0) @binding(0)' here would be a
// SEPARATE naga global at the same slot, which a device (and naga) rejects
// as a binding conflict, not a duplicate-but-equal declaration.
import package::labels::vertex::u;
import package::labels::vertex::labels;
import package::labels::vertex::expandLabelQuad;
import package::lib::camera::worldToClip;
import package::lib::sceneDepth::depthFrame;
import package::lib::sceneDepth::sceneDepthOccludes;

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let label = labels[input.labelIndex];
  let clip = worldToClip(u.cam, label.worldPos.xyz);

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
