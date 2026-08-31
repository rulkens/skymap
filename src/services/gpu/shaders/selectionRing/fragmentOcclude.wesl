// selectionRing/fragmentOcclude.wesl — occluding variants of the
// selection-ring fragment stage.
//
// When the selection ring draws AFTER the solar-system bodies, in a depthless
// OVER composite, a ring anchored behind a planet would otherwise paint over
// the body in front of it. Two discard-gated entries exist so the renderer
// can still pick by mode ('compare' vs 'coverage'), but both now run the SAME
// test, 'coveredByScene' (lib/sceneDepth.wesl) — see that file's header for
// why the depth-compare flavour this once used no longer works once each
// painter-chain row clears its own depth (spec §7.3).
//
// The mask itself is identical to the plain 'fs' entry in selectionRing/fragment.wesl:
// both entries reuse 'shadeRing' so the annulus shape has one source of truth.
// These entries only add the discard gate in front of it.
//
// ## Per-ring, not per-pixel, occlusion
//
// All six ring-quad corners share the anchor's clip-z (the vertex stage
// projects one world position — see selectionRing/vertex.wesl), so the ring
// is occluded or not as a unit against a body in front of it, which is what a
// UI halo wants: an all-or-nothing indicator, not one sliced mid-stroke.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels.

import package::selectionRing::io::VsOut;
import package::selectionRing::fragment::shadeRing;
import package::lib::sceneDepth::coveredByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeRing(input);
}

@fragment
fn fsCoverage(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeRing(input);
}
