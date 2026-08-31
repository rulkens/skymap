// labels/fragmentOcclude.wesl — occluding variants of the MSDF label
// fragment stage.
//
// Labels draw AFTER the solar-system bodies, in a depthless OVER composite. A
// label anchored behind a planet would otherwise paint over the body in front
// of it. Two discard-gated entries exist so the renderer can still pick by
// mode ('compare' vs 'coverage' — see labelRenderer.ts), but both now run the
// SAME test: 'coveredByScene' (lib/sceneDepth.wesl), an alpha-coverage read of
// 'foreground:0'. The 'compare vs coverage' split stopped meaning anything once
// each painter-chain row started clearing its own depth (spec §7.3) — see that
// file's header for why a per-row-cleared depth buffer can't back a compare
// test either. Keeping both names is a hook for labelRenderer.ts's existing
// pipeline-selection, not a live behavioural difference.
//
// The shading itself is identical to the plain 'fs' entry in labels/fragment.wesl:
// both entries reuse 'shadeMsdf' (lib/msdf.wesl) so glyph colour has one source
// of truth. These entries only add the discard gate in front of it.
//
// ## Per-glyph, not per-pixel, occlusion
//
// All four glyph-quad corners share the anchor's clip-z (the vertex stage
// writes one 'clampedClipZ' for the anchor — see labels/vertex.wesl), so the
// caption is occluded or not as a unit — hidden where an opaque body covers
// its anchor, not sliced mid-glyph.
//
// In the fragment stage the VsOut builtin-position field 'input.pos' holds the
// framebuffer position: '.xy' is window pixels.

import package::labels::io::VsOut;
import package::lib::msdf::shadeMsdf;
import package::lib::sceneDepth::coveredByScene;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
}

@fragment
fn fsCoverage(input: VsOut) -> @location(0) vec4<f32> {
  if (coveredByScene(input.pos.xy)) { discard; }
  return shadeMsdf(input.uv, input.fontIndex, input.color, input.outlineColor, input.outlineSdf);
}
