// labels/fragmentOcclude.wesl — depth-occluding variant of the MSDF label
// fragment stage.
//
// ## Why a second entry
//
// The near-field foreground captions draw AFTER the solar-system bodies, in a
// depthless OVER composite. A caption anchored behind a planet would otherwise
// paint over the body that sits in front of it. This variant tests the body
// pass's depth buffer at the fragment and discards where a nearer body already
// owns the pixel — see lib/sceneDepth.wesl for the 'greater means occluded' rule.
//
// The shading itself is identical to the plain 'fs' entry: we reuse
// 'shadeMsdf' from labels/fragment.wesl so glyph colour has one source of
// truth. This entry only adds the discard gate in front of it.
//
// ## Per-glyph, not per-pixel, occlusion
//
// All four glyph-quad corners share the anchor's clip-z (the vertex stage
// writes one 'clampedClipZ' for the anchor — see labels/vertex.wesl), so
// 'input.pos.z' is the anchor's window depth for the whole glyph. The caption is
// therefore occluded or not as a unit — hidden where a nearer body covers it,
// not sliced mid-glyph by the body's curved depth. That is what we want: a
// caption reads as a single label, so its visibility should be all-or-nothing
// against the body in front of it.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels and '.z' is window-space depth.

import package::labels::io::VsOut;
import package::labels::fragment::shadeMsdf;
import package::lib::sceneDepth::occludedByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(input.pos.xy, input.pos.z)) { discard; }
  return shadeMsdf(input);
}
