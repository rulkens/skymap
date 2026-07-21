// selectionRing/fragmentOcclude.wesl — depth-occluding variant of the
// selection-ring fragment stage.
//
// ## Why a second entry
//
// When the selection ring draws AFTER the solar-system bodies, in a depthless
// OVER composite, a ring anchored behind a planet would otherwise paint over
// the body that sits in front of it. This variant tests the body pass's depth
// buffer at the fragment and discards where a nearer body already owns the
// pixel — see lib/sceneDepth.wesl for the 'greater means occluded' rule.
//
// The mask itself is identical to the plain 'fs' entry: we reuse 'shadeRing'
// from selectionRing/fragment.wesl so the annulus shape has one source of
// truth. This entry only adds the discard gate in front of it.
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

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(input.pos.xy, input.pos.z)) { discard; }
  return shadeRing(input);
}
