// bloom/brightFragment.wesl — the bloom prefilter: hdr → bloom0 (half-res), keeping
// only light above a soft threshold so dim structure stays crisp.
//   - Soft threshold 'max(0, luma - threshold) / luma' on max-channel luma: a pixel
//     just over threshold contributes a little instead of popping on.
//   - Firefly clamp: no single pixel injects more than 'ceiling', so a sprite
//     flickering in and out swings the bloom by a bounded amount. With the cap
//     above its floor (the film look), 'ceiling' rises to the dimmest luma of the
//     3x3 bloom0-texel neighbourhood: a lone firefly erodes to the dark around
//     it and keeps the floor, while the Sun's interior erodes to itself.

import package::bloom::io::FullscreenOut;

// Mirrors BrightParams plus the knee (16 bytes); the cap equals the floor unless the film look raises it.
struct BrightUniforms {
  threshold: f32,
  knee: f32,
  cap: f32,
  capFloor: f32,
}

@group(0) @binding(0) var srcSamp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> uniforms: BrightUniforms;

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let source = textureSample(srcTex, srcSamp, in.uv).rgb;
  let luma = max(source.r, max(source.g, source.b));
  let softWeight = max(0.0, luma - uniforms.threshold) / max(luma, 0.0001);
  var bright = source * softWeight;
  let brightLuma = max(bright.r, max(bright.g, bright.b));
  var ceiling = uniforms.capFloor;
  if (uniforms.cap > uniforms.capFloor && softWeight > 0.0) {
    // One bloom0 texel is two hdr texels.
    let bloomTexel = 2.0 / vec2<f32>(textureDimensions(srcTex));
    var eroded = luma;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let neighbourUv = in.uv + vec2<f32>(f32(dx), f32(dy)) * bloomTexel;
        let neighbour = textureSampleLevel(srcTex, srcSamp, neighbourUv, 0.0).rgb;
        eroded = min(eroded, max(neighbour.r, max(neighbour.g, neighbour.b)));
      }
    }
    ceiling = clamp(eroded, uniforms.capFloor, uniforms.cap);
  }
  if (brightLuma > ceiling) { bright = bright * (ceiling / brightLuma); }
  return vec4<f32>(bright, 1.0);
}
