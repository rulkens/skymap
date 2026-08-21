// labels/fragmentOcclude.wesl — depth-occluding variant of the MSDF label
// fragment stage.
//
// ## Why two occluding entries
//
// Labels draw AFTER the solar-system bodies, in a depthless OVER composite. A
// label anchored behind a planet would otherwise paint over the body in front
// of it. Two families of label need occluding, from different projections, so
// this file exposes two discard-gated entries (the renderer picks one by mode):
//
//   'fs' — depth COMPARE via 'occludedByScene(input.pos.xy, input.pos.z)'. Used
//   by the NEAR0 foreground captions, which share the bodies' slab so their
//   window depth is comparable — see lib/sceneDepth.wesl for the 'greater means
//   occluded' rule. Compare keeps a caption visible over its OWN body.
//
//   'fsCoverage' — pure COVERAGE via 'coveredByScene(input.pos.xy)' (no depth
//   arg). Used by the COSMO overlay labels, which project through a different
//   slab than the NEAR0 bodies, so their window-Z is incomparable to the stored
//   body depth; any body depth written at this pixel occludes them.
//
// The shading itself is identical to the plain 'fs' entry in labels/fragment.wesl:
// both entries reuse 'shadeMsdf' (lib/msdf.wesl) so glyph colour has one source
// of truth. These entries only add the discard gate in front of it.
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
import package::lib::msdf::shadeMsdf;
import package::lib::sceneDepth::occludedByScene;
import package::lib::sceneDepth::coveredByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (occludedByScene(input.pos.xy, input.pos.z)) { discard; }
  return shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
}

@fragment
fn fsCoverage(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
}
