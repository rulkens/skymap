// foregroundComposite/fragment.wesl — sample the foreground colour texture,
// tone-map it, and emit it straight for OVER-compositing onto the
// tone-mapped swap chain.
//
// ## Why tone-map here
//
// The foreground (Sun, Earth, later an atmosphere) renders in HDR into its
// own offscreen, then composites AFTER the UI overlay so opaque bodies
// occlude the galaxy-level labels.  The swap chain is already LDR by then,
// so this pass applies the SAME five-curve tone-map the scene used (shared
// 'lib/tonemap.wesl' math, shared parameters through the ToneMapUniforms
// block) before the OVER blend, so the foreground shares the background's
// response across the limb.  Alpha (coverage) passes through untouched so a
// translucent atmosphere tints the labels behind it rather than hard-masking.
//
// ## Blend model: straight (unassociated) OVER
//
// This pass uses the Porter-Duff OVER operator with straight alpha:
//
//   out_rgb   = src_alpha * src_rgb + (1 - src_alpha) * dst_rgb
//   out_alpha = src_alpha + (1 - src_alpha) * dst_alpha
//
// The blend state in 'foregroundComposite.ts' is:
//   color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }
//   alpha: { srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add' }
//
// The hardware multiplies the emitted color by 'src-alpha' itself, so the
// fragment shader must emit the colour STRAIGHT (not premultiplied) --
// emitting premultiplied colour here would cause a double-multiplication
// ('src-alpha * (src-alpha * src_rgb)'), visually darkening semi-transparent
// foreground objects.
//
// Contrast with 'volumeUpsample/fragment.wesl', whose pipeline uses
// additive blending '(one, one)': the volume offscreen already holds the
// summed additive contribution of every field and is blended additively
// into HDR -- no alpha coverage is involved.  The foreground offscreen
// holds a render of opaque/translucent geometry with real alpha (e.g. an
// Earth with an atmosphere limb), so OVER composition is correct.
//
// ## Why no low-pass filter (unlike volumeUpsample)
//
// volumeUpsample applies a 4-tap rotated-grid filter to suppress jitter
// grain from the stochastic volume raymarch.  The foreground is rasterised
// deterministically at full resolution -- there is no grain to suppress and
// no downsampling to undo.  A single bilinear sample is exact.

import package::foregroundComposite::io::VSOut;
import package::toneMap::io::ToneMapUniforms;
import package::lib::tonemap::applyLinear;
import package::lib::tonemap::applyReinhard;
import package::lib::tonemap::applyAsinh;
import package::lib::tonemap::applyGamma2;
import package::lib::tonemap::applyAces;

@group(0) @binding(0) var fgTex: texture_2d<f32>;
@group(0) @binding(1) var fgSamp: sampler;
@group(0) @binding(2) var<uniform> u: ToneMapUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Single bilinear sample -- the foreground target is full resolution,
  // so 'in.uv' maps to exactly the corresponding foreground texel.
  let fg = textureSample(fgTex, fgSamp, in.uv);

  // Tone-map the HDR foreground colour with the scene's curve.  The same
  // 'if' chain as 'toneMap/fragment.wesl' (a dynamic-uniform branch the GPU
  // handles per-frame-uniformly), over the shared 'lib/tonemap.wesl' math.
  let scaled = fg.rgb * u.exposure;
  var mapped: vec3<f32>;
  if (u.curve == 0u) {
    mapped = applyLinear(scaled);
  } else if (u.curve == 1u) {
    mapped = applyReinhard(scaled, u.whitepointSq);
  } else if (u.curve == 2u) {
    mapped = applyAsinh(scaled, u.asinhSoftness);
  } else if (u.curve == 3u) {
    mapped = applyGamma2(scaled);
  } else {
    mapped = applyAces(scaled);
  }

  // Emit straight-alpha: tone-mapped colour with the foreground's own
  // coverage.  The blend hardware applies 'srcFactor: src-alpha', completing
  // the Porter-Duff OVER described in the module header.
  return vec4<f32>(mapped, fg.a);
}
