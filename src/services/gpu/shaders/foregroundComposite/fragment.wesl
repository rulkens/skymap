// foregroundComposite/fragment.wesl — sample the foreground colour texture
// and emit it straight for OVER-compositing into the HDR target.
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

@group(0) @binding(0) var fgTex: texture_2d<f32>;
@group(0) @binding(1) var fgSamp: sampler;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Single bilinear sample -- the foreground target is full resolution,
  // so 'in.uv' maps to exactly the corresponding foreground texel.
  // The linear sampler gives a clean result at non-integer UVs caused
  // by sub-pixel rounding, matching the volumeUpsample convention.
  //
  // The returned value is the foreground colour in straight-alpha form.
  // The blend hardware applies 'srcFactor: src-alpha', completing the
  // Porter-Duff OVER multiplication described in the module header.
  return textureSample(fgTex, fgSamp, in.uv);
}
