// lib/sceneDepth.wesl — the shared scene-depth occlusion tests for the
// overlay renderers that draw AFTER the solar-system bodies.
//
// ## What this is
//
// A caption drawn AFTER the solar-system bodies must not paint over a planet
// that sits IN FRONT of it. Rather than sort captions against every body on the
// CPU, we sample the body pass's depth buffer at the caption fragment and
// discard where a nearer body already owns the pixel.
//
// ## Two occluders: 'compare' (same-slab) vs 'coverage' (cross-slab)
//
// There are two flavours of occluder here, because two families of overlay
// draw over the bodies from DIFFERENT projections:
//
//   'occludedByScene' — a depth COMPARE. Used by the NEAR0 foreground captions,
//   which live in the SAME NEAR0 reversed-Z slab as the bodies, so their
//   window-Z is directly comparable to the stored body depth. Compare is what
//   keeps a caption visible over its OWN body (its depth is not strictly less
//   than the body it labels) while hiding it behind a NEARER body.
//
//   'coveredByScene' — a pure COVERAGE test. Used by the COSMO overlays
//   (labels, marker-lines, selection ring), which project through the COSMO
//   slab. Their window-Z is in a DIFFERENT projection than the NEAR0 body
//   depths stored in 'foreground:0', so comparing the two numbers is
//   meaningless — a depth compare would never fire and a cosmological label
//   would paint over the Sun. The correct occluder is 'any body depth written
//   at this pixel', i.e. strictly greater than the 0.0 far/clear value.
//
// ## Why 'greater' means occluded
//
// The body depth attachment is 'depthCompare: greater' cleared to 0.0 (the far
// value under reversed-Z), so a nearer body writes a LARGER depth. A stored
// sample strictly greater than this fragment's own depth therefore means a
// NEARER body already covers this pixel — the caption is behind it and must
// discard. Empty sky reads the 0.0 clear, which is never greater than a
// fragment's depth, so captions over empty sky are kept.
//
// ## Why textureLoad, no sampler
//
// Depth textures are unfilterable, so there is no sampler overload — we fetch
// the exact texel with 'textureLoad'. 'fragXY' is the fragment's window-space
// '@builtin(position).xy', which indexes the depth texel 1:1 because
// 'foreground:0' and 'swap' both render at scale 1 (no half-res detour), so no
// UV remap is needed. The alternative, sampling with a comparison sampler,
// would force a same-size compare pipeline for no gain over the direct load.

@group(1) @binding(0) var sceneDepthTex: texture_depth_2d;

fn occludedByScene(fragXY: vec2f, fragDepth: f32) -> bool {
  return textureLoad(sceneDepthTex, vec2i(fragXY), 0) > fragDepth;
}

// Cross-slab coverage test for the COSMO overlays: no depth argument, because
// their window-Z is incomparable to the stored NEAR0 body depth (see the
// 'compare vs coverage' note above). 'foreground:0' clears to 0.0 (the far
// value under reversed-Z) and any body writes strictly greater than that, so a
// stored sample > 0.0 means a body owns this pixel and the overlay must discard.
fn coveredByScene(fragXY: vec2f) -> bool {
  return textureLoad(sceneDepthTex, vec2i(fragXY), 0) > 0.0;
}
