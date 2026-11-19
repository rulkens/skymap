// lib/occlusionMask.wesl — an overlay's read of an occlusion mask
// ('occlusionMask::io': r coverage, g distance km), the mask twin of
// 'lib::sceneDepth'. The mask is the output's own size, so a window px indexes
// its texel 1:1. textureLoad only: the format cannot be filtered, and a
// filtered distance across a silhouette invents a surface that is not there.

import package::lib::math::saturate;

@group(1) @binding(0) var occlusionMaskTex: texture_2d<f32>;

// Fraction of the pixel the foreground covers: 1 under an opaque body. Callers
// scale their PREMULTIPLIED output by one minus this.
fn maskCoverage(fragXY: vec2f) -> f32 {
  return saturate(textureLoad(occlusionMaskTex, vec2i(fragXY), 0).r);
}

// 1 where the mask's surface at 'atPx' stands nearer than 'nearKm' (a subject's
// near surface: centre minus radius), else 0. "No surface" is far beyond any
// subject, so it never occludes. Guarded rather than leaning on what an
// out-of-bounds textureLoad returns, which WGSL does not pin.
fn maskOccludes(atPx: vec2f, nearKm: f32) -> f32 {
  let sizePx = vec2f(textureDimensions(occlusionMaskTex));
  if (atPx.x < 0.0 || atPx.x >= sizePx.x || atPx.y < 0.0 || atPx.y >= sizePx.y) {
    return 0.0;
  }
  return select(0.0, 1.0, textureLoad(occlusionMaskTex, vec2i(atPx), 0).g < nearKm);
}
