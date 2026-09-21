// markerLines/vertexOcclude.wesl — the scene-attenuated thick-line vertex
// stage, this file's twin to labels/vertexOcclude.wesl (same own-module
// reason: no group(1) in the plain pipeline's layout). Judges the
// connector's 'fromWorld' — the subject end — not per line pixel.

import package::markerLines::io::VsIn;
import package::markerLines::io::VsOut;
// 'u' is imported, not redeclared: a second '@group(0) @binding(0)' here
// would conflict with vertex.wesl's existing declaration.
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
