// lib/sceneDepth.wesl — the shared scene-depth occlusion test for the
// near-field foreground caption renderers.
//
// ## What this is
//
// A caption drawn AFTER the solar-system bodies must not paint over a planet
// that sits IN FRONT of it. Rather than sort captions against every body on the
// CPU, we sample the body pass's depth buffer at the caption fragment and
// discard where a nearer body already owns the pixel.
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
