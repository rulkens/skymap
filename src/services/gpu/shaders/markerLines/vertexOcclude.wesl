// markerLines/vertexOcclude.wesl — the scene-attenuated variant of the
// thick-line vertex stage, mirroring fragmentOcclude.wesl's role one stage
// earlier (see labels/vertexOcclude.wesl, this file's twin, for the full
// rationale — same fix, same module-split reason: importing
// 'lib::sceneDepth' hoists its group(1) bindings, and the plain pipeline's
// layout has none, so 'vs' (vertex.wesl) must stay clear of this file's
// imports).
//
// The verdict is judged at the connector's SUBJECT end, not per rendered
// line pixel. 'label2DDirector' synthesizes each caption's leader line with
// 'fromWorld' near the subject (label2DDirector.applyLift lerps it off the
// body's own anchor, clearing the rim by 'lineBottomLiftPx') and 'toWorld' at
// the caption's own lifted position — the same point 'labels/vertexOcclude
// .wesl' judges for the caption. Judging 'fromWorld' here means the
// connector and its caption each answer for the end they actually draw
// nearest to.

import package::markerLines::io::VsIn;
import package::markerLines::io::VsOut;
// 'u' is imported, not redeclared: vertex.wesl already binds group(0)
// binding(0), and 'expandMarkerLineQuad' below pulls that same declaration
// into this linked module — a second '@group(0) @binding(0)' here would be a
// SEPARATE naga global at the same slot, which a device (and naga) rejects
// as a binding conflict, not a duplicate-but-equal declaration.
import package::markerLines::vertex::u;
import package::markerLines::vertex::expandMarkerLineQuad;
import package::lib::camera::worldToClip;
import package::lib::sceneDepth::depthFrame;
import package::lib::sceneDepth::sceneDepthOccludes;

@vertex
fn vsOcclude(input: VsIn) -> VsOut {
  let subjectWorld = input.fromAndWidth.xyz;
  let clip = worldToClip(u.cam, subjectWorld);

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
      verdict = sceneDepthOccludes(anchorXY, input.occludeNearKm);
    }
  }

  return expandMarkerLineQuad(input, max(input.occludeWeight, verdict));
}
