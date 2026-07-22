// constellations/fragment.wesl — soft anti-aliased line fragment stage for the
// constellation stick figures.
//
// A single dim steel-blue tone for every figure (grill Q5 — no per-constellation
// hue). Three scalars shape the emitted alpha:
//
//   - edgeBandMask(uv.y, ...) — a two-tailed smoothstep giving a soft edge
//     across the line's perpendicular axis (the screen-space anti-aliasing),
//     the same shape filaments paints. 'lib/masks.wesl' owns the pattern.
//   - u.intensity — the user's constellation-intensity slider, a per-frame
//     scale on the whole overlay (grill Q5).
//   - fade.opacity — the layer's per-frame distance fade, folded in via
//     'applyFade' so opacity never attenuates RGB (only alpha).
//
// The output is premultiplied (rgb * alpha, alpha) into the additive HDR target,
// so overlapping figure lines sum their faint glow rather than occluding.
//
// ## Why bindings are declared here, not in io.wesl
//
// Same WESL no-global-state argument as the sibling renderers: 'Uniforms' is
// imported from io.wesl, the '@group/@binding' declarations live here, and the
// layout matches vertex.wesl's identical declaration. 'FadeUniforms' is the
// shared 16-byte opacity struct from 'lib/fadeUniforms.wesl'.

import package::constellations::io::Uniforms;
import package::constellations::io::VSOut;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;
import package::lib::masks::edgeBandMask;

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(1) @binding(0) var<uniform> fade : FadeUniforms;

// Dim steel-blue, one tone for all 88 figures. Emitted additively into the HDR
// buffer, so it reads as a cool faint wireflow over the starfield rather than a
// saturated UI stroke. Eye-tuning starting point (Task 15).
const STEEL_BLUE : vec3<f32> = vec3<f32>(0.42, 0.58, 0.9);

// Base emission before the intensity slider, soft edge, and fade. Keeps a lone
// figure line visible against the tone-mapped HDR background without saturating
// where many segments overlap. Eye-tuning starting point (Task 15).
const BASE_ALPHA : f32 = 0.5;

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Soft edge across the line width: uv.y in [0,1], peak at 0.5. fade=0.25 gives
  // a 25%-on / 50%-flat / 25%-off shape — a gentle taper for a thin line.
  let edge = edgeBandMask(in.uv.y, 0.25);
  let alpha = applyFade(edge * BASE_ALPHA * u.intensity, fade.opacity);
  return vec4<f32>(STEEL_BLUE * alpha, alpha); // pre-multiplied alpha
}
