// markerLines/fragmentOcclude.wesl — depth-occluding variant of the
// soft-edged thick-line fragment stage.
//
// ## Why two occluding entries
//
// Leader lines draw AFTER the solar-system bodies, in a depthless OVER
// composite. A connector anchored behind a planet would otherwise paint over
// the body in front of it. Two families need occluding, from different
// projections, so this file exposes two discard-gated entries (the renderer
// picks one by mode). This is the leader-line mirror of labels/fragmentOcclude.wesl:
//
//   'fs' — depth COMPARE via 'occludedByScene(input.pos.xy, input.pos.z)'. Used
//   by the NEAR0 foreground connectors, which share the bodies' slab so their
//   window depth is comparable — see lib/sceneDepth.wesl for the 'greater means
//   occluded' rule.
//
//   'fsCoverage' — pure COVERAGE via 'coveredByScene(input.pos.xy)' (no depth
//   arg). Used by the COSMO overlay marker-lines, which project through a
//   different slab than the NEAR0 bodies, so their window-Z is incomparable to
//   the stored body depth; any body depth written at this pixel occludes them.
//
// The shading itself is identical to the plain 'fs' entry in markerLines/fragment.wesl:
// both entries reuse 'shadeLine' so line colour has one source of truth. These
// entries only add the discard gate in front of it.
//
// ## Well-defined window depth at the connector fragment
//
// The leader-line vertex stage clamps clip-z the same way the label one does
// (see markerLines/vertex.wesl § 'The z is clamped to survive any far plane'):
// endpoints far beyond the adaptive far plane are pulled just inside it so the
// connector survives frustum clipping. That clamp makes 'input.pos.z' a
// well-defined window depth here, which is exactly what 'occludedByScene'
// compares against the stored body depth. In the fragment stage the VsOut
// builtin-position field 'input.pos' holds the framebuffer position: '.xy' is
// window pixels and '.z' is window-space depth.

import package::markerLines::io::VsOut;
import package::markerLines::fragment::shadeLine;
import package::lib::sceneDepth::occludedByScene;
import package::lib::sceneDepth::coveredByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(input.pos.xy, input.pos.z)) { discard; }
  return shadeLine(input);
}

@fragment
fn fsCoverage(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeLine(input);
}
