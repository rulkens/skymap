// bloomBright.wesl — bloom prefilter (bright pass). Adapted from the
// galaxy-renderer's copy; see tools/galaxy-renderer/src/engine/shaders/
// bloomBright.wesl for the full rationale of the two stability guards:
//
//   - Soft threshold 'f = max(0, l - threshold) / l' on max-channel luma,
//     so a pixel just above threshold eases in instead of popping as the
//     camera drifts.
//   - Firefly clamp: caps any SINGLE pixel's injection into the pyramid,
//     bounding the frame-to-frame swing of sub-pixel star cores (the
//     bloom-flicker killer).
//
// The threshold here is a UNIFORM (not the galaxy-renderer's constant)
// because the nebula scene needs it placed carefully: rims and star cores
// must bloom, the broad dust mid-tones must not — and that boundary is
// exactly what the spike exists to tune.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>; // x: threshold, y: firefly cap

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, i.uv).rgb;
  let l = max(c.r, max(c.g, c.b));
  let f = max(0.0, l - u.x) / max(l, 0.0001);
  var o = c * f;
  let ol = max(o.r, max(o.g, o.b));
  if (ol > u.y) { o = o * (u.y / ol); }
  return vec4<f32>(o, 1.0);
}
