// bloom/fold.wesl — the final composite of the dual-filter bloom pyramid:
// samples the accumulated finest level (bloom0) and scales it by the user's
// bloom strength, folding the result back into the HDR scene.
//
// Drawn with ADDITIVE blending — the blend state lives in the PIPELINE, not
// this shader, which just emits the strength-scaled colour. That is why the
// fold is a dedicated method rather than a reuse of the generic compositor:
// 'strength' is a per-draw multiply the compositor's fixed blend table has no
// slot for, so it rides a uniform here ('u.x').
//
// bloom0 is half-res (renderTargets 'bloom0' scale 2); the linear sampler
// upscales it to full HDR resolution as it reads. A strength of 0 folds
// nothing (the frame program omits the whole bloom sub-program when bloom is
// disabled, but a live strength of 0 is still a valid no-glow state); higher
// values brighten the glow linearly.

import package::bloom::io::FullscreenOut;
import package::bloom::io::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>; // x: strength

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, i.uv).rgb;
  return vec4<f32>(c * u.x, 1.0);
}
