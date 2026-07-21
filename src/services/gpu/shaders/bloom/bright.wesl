// bloom/bright.wesl — the bloom pyramid's prefilter (bright pass). Extracts
// the part of the HDR scene above a soft threshold, so only genuinely bright
// features (the Sun's disc, star cores) seed the bloom — dim structure stays
// crisp.
//
// The two guards here matter for a STABLE bloom:
//   - Soft threshold: a knee 'f = max(0, l - threshold) / l' on the max-channel
//     luma, so a pixel just above threshold contributes a little rather than
//     snapping fully on (a hard threshold pops as the camera drifts).
//   - Firefly clamp (maxB = 2.0): caps how much any SINGLE pixel can inject
//     into the pyramid. A tiny sprite flickering in and out then swings the
//     bloom by a small bounded amount instead of a huge spike — the temporal-
//     flicker killer for point-like features. Large stable features still
//     bloom because their light accumulates over many pixels, not one.

import package::bloom::io::FullscreenOut;
import package::bloom::io::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>; // x: threshold, y: knee

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, i.uv).rgb;
  let l = max(c.r, max(c.g, c.b));
  let f = max(0.0, l - u.x) / max(l, 0.0001);
  var o = c * f;
  // Firefly clamp: cap how bright any single pixel can enter the bloom pyramid. A tiny
  // sprite popping in/out then contributes a small, bounded amount instead of a huge
  // spike, so its on/off swing (the flicker) is minimal. Large stable features (the
  // Sun's disc, bright cores) still bloom because their brightness accumulates over many
  // pixels.
  let ol = max(o.r, max(o.g, o.b));
  let maxB = 2.0;
  if (ol > maxB) { o = o * (maxB / ol); }
  return vec4<f32>(o, 1.0);
}
