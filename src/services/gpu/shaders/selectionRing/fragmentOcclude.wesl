// selectionRing/fragmentOcclude.wesl — depth-occluding variant of the
// selection-ring fragment stage.
//
// ## Why two occluding entries
//
// When the selection ring draws AFTER the solar-system bodies, in a depthless
// OVER composite, a ring anchored behind a planet would otherwise paint over
// the body in front of it. Two families need occluding, from different
// projections, so this file exposes two discard-gated entries (the renderer
// picks one by mode):
//
//   'fs' — depth COMPARE via 'occludedByScene(input.pos.xy, input.pos.z)'. Used
//   by a NEAR0 ring that shares the bodies' slab so its window depth is
//   comparable — see lib/sceneDepth.wesl for the 'greater means occluded' rule.
//
//   'fsCoverage' — pure COVERAGE via 'coveredByScene(input.pos.xy)' (no depth
//   arg). Used by the COSMO selection ring, which projects through a different
//   slab than the NEAR0 bodies, so its window-Z is incomparable to the stored
//   body depth; any body depth written at this pixel occludes it.
//
// The mask itself is identical to the plain 'fs' entry in selectionRing/fragment.wesl:
// both entries reuse 'shadeRing' so the annulus shape has one source of truth.
// These entries only add the discard gate in front of it.
//
// ## Per-ring, not per-pixel, occlusion depth
//
// All six ring-quad corners share the anchor's clip-z (the vertex stage
// projects one world position — see selectionRing/vertex.wesl), so
// 'input.pos.z' is the anchor's window depth for the whole ring. The ring is
// therefore occluded or not as a unit against a body in front of it, which is
// what a UI halo wants: an all-or-nothing indicator, not one sliced mid-stroke
// by the body's curved depth.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels and '.z' is window-space depth.

import package::selectionRing::io::VsOut;
import package::selectionRing::fragment::shadeRing;
import package::lib::sceneDepth::occludedByScene;
import package::lib::sceneDepth::coveredByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(input.pos.xy, input.pos.z)) { discard; }
  return shadeRing(input);
}

@fragment
fn fsCoverage(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeRing(input);
}
