// lib/occlusionMask.wesl — an overlay's read of an occlusion mask
// ('occlusionMask::io'), the mask twin of 'lib::sceneDepth'. The mask is the
// output's own size, so a window px indexes its texel 1:1.

import package::lib::math::saturate;

@group(1) @binding(0) var occlusionMaskTex: texture_2d<f32>;

// Callers scale their PREMULTIPLIED output by one minus this.
fn maskCoverage(fragXY: vec2f) -> f32 {
  return saturate(textureLoad(occlusionMaskTex, vec2i(fragXY), 0).r);
}

// 1 where the mask's surface at 'atPx' stands nearer than 'nearKm'. Guarded:
// WGSL does not pin what an out-of-bounds textureLoad returns.
fn maskOccludes(atPx: vec2f, nearKm: f32) -> f32 {
  let sizePx = vec2f(textureDimensions(occlusionMaskTex));
  if (atPx.x < 0.0 || atPx.x >= sizePx.x || atPx.y < 0.0 || atPx.y >= sizePx.y) {
    return 0.0;
  }
  return select(0.0, 1.0, textureLoad(occlusionMaskTex, vec2i(atPx), 0).g < nearKm);
}
