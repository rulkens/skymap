// markerLines/fragmentOcclude.wesl — depth-occluding variant of the
// soft-edged thick-line fragment stage.
//
// ## Why a second entry
//
// The near-field foreground leader lines draw AFTER the solar-system bodies,
// in a depthless OVER composite. A connector anchored behind a planet would
// otherwise paint over the body that sits in front of it. This variant tests
// the body pass's depth buffer at the fragment and discards where a nearer
// body already owns the pixel — see lib/sceneDepth.wesl for the 'less means
// occluded' rule. This is the leader-line mirror of labels/fragmentOcclude.wesl.
//
// The shading itself is identical to the plain 'fs' entry: we reuse
// 'shadeLine' from markerLines/fragment.wesl so line colour has one source of
// truth. This entry only adds the discard gate in front of it.
//
// ## Well-defined window depth at the connector fragment
//
// The leader-line vertex stage clamps clip-z the same way the label one does
// (see markerLines/vertex.wesl § 'The z is clamped to survive any far plane'):
// endpoints far beyond the adaptive far plane are pulled just inside it so the
// connector survives frustum clipping. That clamp makes 'pos.z' a well-defined
// window depth here, which is exactly what 'occludedByScene' compares against
// the stored body depth.

import package::markerLines::io::VsOut;
import package::markerLines::fragment::shadeLine;
import package::lib::sceneDepth::occludedByScene;

@fragment
fn fs(@builtin(position) pos: vec4<f32>, input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(pos.xy, pos.z)) { discard; }
  return shadeLine(input);
}
