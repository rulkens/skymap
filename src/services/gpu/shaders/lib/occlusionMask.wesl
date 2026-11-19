// lib/occlusionMask.wesl — an overlay's read of an occlusion mask
// ('occlusionMask::io'), the mask twin of 'lib::sceneDepth'. The mask covers
// the output at its own, possibly smaller, size: a window px maps to a texel
// by 'outputPx', the output's size, never 1:1.

import package::lib::math::saturate;

@group(1) @binding(0) var occlusionMaskTex: texture_2d<f32>;

fn maskTexel(atPx: vec2f, outputPx: vec2f) -> vec2i {
  return vec2i(atPx * vec2f(textureDimensions(occlusionMaskTex)) / outputPx);
}

// Callers scale their PREMULTIPLIED output by one minus this.
fn maskCoverage(fragXY: vec2f, outputPx: vec2f) -> f32 {
  return saturate(textureLoad(occlusionMaskTex, maskTexel(fragXY, outputPx), 0).r);
}

// 1 where the mask's surface at 'atPx' stands nearer than 'nearKm'. Guarded:
// WGSL does not pin what an out-of-bounds textureLoad returns.
fn maskOccludes(atPx: vec2f, nearKm: f32, outputPx: vec2f) -> f32 {
  if (atPx.x < 0.0 || atPx.x >= outputPx.x || atPx.y < 0.0 || atPx.y >= outputPx.y) {
    return 0.0;
  }
  return select(0.0, 1.0, textureLoad(occlusionMaskTex, maskTexel(atPx, outputPx), 0).g < nearKm);
}
