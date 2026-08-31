// lib/sceneDepth.wesl — how much of an overlay drawn AFTER the solar-system
// bodies survives the foreground in front of it.
//
// Not depth: every 'foreground:0' painter-chain row clears its OWN depth
// (spec §7.3), so that buffer holds only the last row's value, and depths from
// different metre-frame projections don't compare anyway. Alpha does survive —
// the target LOADS between rows.
//
// A factor, not a threshold: 'foreground:0' alpha is the weight the
// 'foreground:0 → hdr' OVER composite multiplies the foreground by, which is
// exactly how much of the background this pixel hides. A binary 'a > 0.5' read
// it as a second, independent thing and held only while every translucent
// producer stayed under 0.5 — a dense cloud deck or Earth's descent fade
// crossing it flipped captions with nothing changing about what was drawn.

import package::lib::math::saturate;

@group(1) @binding(0) var sceneColorTex: texture_2d<f32>;

/**
 * Fraction of an overlay fragment that survives the foreground at this pixel:
 * 0 under an opaque body, 1 where the foreground drew nothing. Callers
 * multiply their PREMULTIPLIED output by it, so colour and coverage fall off
 * together. 'saturate' guards the loud failure mode — an a > 1 producer would
 * give a negative factor, which BRIGHTENS an overlay under premultiplied OVER.
 *
 * 'fragXY' is '@builtin(position).xy', which indexes the colour texel 1:1
 * because 'foreground:0' and 'swap' both render at scale 1.
 */
fn sceneTransmittance(fragXY: vec2f) -> f32 {
  return saturate(1.0 - textureLoad(sceneColorTex, vec2i(fragXY), 0).a);
}
