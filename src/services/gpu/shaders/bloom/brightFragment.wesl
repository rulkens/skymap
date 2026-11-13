// bloom/brightFragment.wesl — the bloom prefilter: hdr → bloom0 (half-res), keeping
// only light above a soft threshold so dim structure stays crisp.
//   - Soft threshold 'f = max(0, l - threshold) / l' on max-channel luma: a pixel
//     just over threshold contributes a little instead of popping on.
//   - Firefly clamp: no single pixel injects more than 'maxB', so a sprite
//     flickering in and out swings the bloom by a bounded amount. With the cap
//     above its floor (the film look), 'maxB' rises to the dimmest luma of the
//     3x3 bloom0-texel neighbourhood: a lone firefly erodes to the dark around
//     it and keeps the floor, while the Sun's interior erodes to itself.

import package::bloom::io::FullscreenOut;

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
// x threshold, y knee, z cap, w cap floor (the cap equals the floor unless the film look raises it)
@group(0) @binding(2) var<uniform> u: vec4<f32>;

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, i.uv).rgb;
  let l = max(c.r, max(c.g, c.b));
  let f = max(0.0, l - u.x) / max(l, 0.0001);
  var o = c * f;
  let ol = max(o.r, max(o.g, o.b));
  var maxB = u.w;
  if (u.z > u.w && f > 0.0) {
    // One bloom0 texel is two hdr texels.
    let t = 2.0 / vec2<f32>(textureDimensions(tex));
    var eroded = l;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let n = textureSampleLevel(tex, samp, i.uv + vec2<f32>(f32(dx), f32(dy)) * t, 0.0).rgb;
        eroded = min(eroded, max(n.r, max(n.g, n.b)));
      }
    }
    maxB = clamp(eroded, u.w, u.z);
  }
  if (ol > maxB) { o = o * (maxB / ol); }
  return vec4<f32>(o, 1.0);
}
