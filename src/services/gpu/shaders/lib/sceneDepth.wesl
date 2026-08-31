// lib/sceneDepth.wesl — the shared scene-coverage occlusion test for the
// overlay renderers that draw AFTER the solar-system bodies.
//
// A caption drawn AFTER the solar-system bodies must not paint over a planet
// that sits IN FRONT of it. Rather than sort captions against every body on the
// CPU, we sample the body pass's colour buffer at the caption fragment and
// discard where an opaque body already owns the pixel.
//
// ## One test, not two — why this collapsed from a depth compare
//
// This used to carry two occluders: a depth COMPARE for captions sharing the
// body pass's own slab, and a pure coverage test for captions projected
// through a different slab. Both are gone now that each 'foreground:0'
// painter-chain row clears its OWN depth (spec §7.3) — the shared depth
// buffer only ever holds the LAST row's value, unusable as an 'is a body
// here' signal for either flavour, in ANY slab. Colour survives: the target
// LOADS (not clears) between chain rows, so alpha accumulates under OVER
// compositing across every row drawn this frame.
//
// ## Why 'alpha > 0.5', not '> 0'
//
// 'foreground:0' clears to a=0, so its OVER composite into HDR is a no-op
// wherever the foreground drew nothing, and an opaque body fragment (the
// globe, a planet, a ring) writes a=1. 'atmosphereShellLayer' and
// 'cloudShellLayer' depth-test but do NOT depth-write and their fragments
// are translucent, so a naive 'a > 0' test would let their faint limb glow
// occlude captions too. The 0.5 threshold passes the opaque body, not the
// shell.
//
// ## Why textureLoad, no sampler
//
// 'fragXY' is the fragment's window-space '@builtin(position).xy', which
// indexes the colour texel 1:1 because 'foreground:0' and 'swap' both render
// at scale 1 (no half-res detour) — no UV remap, no filtering wanted.

@group(1) @binding(0) var sceneColorTex: texture_2d<f32>;

/** True where the opaque foreground owns this pixel. Shells (a <= 0.5) do not. */
fn coveredByScene(fragXY: vec2f) -> bool {
  return textureLoad(sceneColorTex, vec2i(fragXY), 0).a > 0.5;
}
