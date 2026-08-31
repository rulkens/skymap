// markerLines/fragmentOcclude.wesl — occluding variants of the soft-edged
// thick-line fragment stage.
//
// Leader lines draw AFTER the solar-system bodies, in a depthless OVER
// composite. A connector anchored behind a planet would otherwise paint over
// the body in front of it. This is the leader-line mirror of
// labels/fragmentOcclude.wesl: two discard-gated entries exist so the renderer
// can still pick by mode ('compare' vs 'coverage'), but both now run the SAME
// test, 'coveredByScene' (lib/sceneDepth.wesl) — see that file's header for
// why the depth-compare flavour this once used no longer works once each
// painter-chain row clears its own depth (spec §7.3).
//
// The shading itself is identical to the plain 'fs' entry in markerLines/fragment.wesl:
// both entries reuse 'shadeLine' so line colour has one source of truth. These
// entries only add the discard gate in front of it.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels.

import package::markerLines::io::VsOut;
import package::markerLines::fragment::shadeLine;
import package::lib::sceneDepth::coveredByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeLine(input);
}

@fragment
fn fsCoverage(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeLine(input);
}
