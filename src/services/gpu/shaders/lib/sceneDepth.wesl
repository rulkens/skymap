// lib/sceneDepth.wesl — how much of an overlay drawn AFTER the solar-system
// bodies survives the foreground in front of it.
//
// Not depth: every 'foreground:0' row clears its OWN depth (spec §7.3), so that
// buffer holds only the last row's value, and metre-frame depths don't compare
// across rows anyway. Alpha survives — the target LOADS between rows.
//
// A factor, never a threshold: this alpha is the weight the 'foreground:0 →
// hdr' OVER composite already multiplies the foreground by, so any cutoff over
// it gives one number two meanings.

import package::lib::math::saturate;

@group(1) @binding(0) var sceneColorTex: texture_2d<f32>;

/**
 * Fraction of an overlay fragment that survives here: 0 under an opaque body,
 * 1 where the foreground drew nothing. Callers scale their PREMULTIPLIED output
 * by it; 'saturate' guards the loud failure mode, since an a > 1 producer would
 * give a negative factor, which BRIGHTENS an overlay under premultiplied OVER.
 * 'fragXY' ('@builtin(position).xy') indexes the texel 1:1 because
 * 'foreground:0' and 'swap' both render at scale 1.
 */
fn sceneTransmittance(fragXY: vec2f) -> f32 {
  return saturate(1.0 - textureLoad(sceneColorTex, vec2i(fragXY), 0).a);
}
