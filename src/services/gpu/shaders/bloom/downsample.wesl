// bloom/downsample.wesl — the descending half of the dual-filter bloom
// pyramid (Marius Bjorge / 'Next Generation Post Processing in Call of Duty').
// Halves resolution while blurring: a 5-tap filter (centre x4 plus four
// diagonal taps, /8). 'u.xy' is the SOURCE texel size so the diagonal taps
// land on the source's texel corners; 'u.z' is the level-0 flag.
//
// ## Why the Karis average on level 0 only
//
// A single ultra-bright sub-pixel firefly, averaged normally, dominates the
// coarser mip and then SWINGS it as the firefly drifts between texels frame to
// frame — visible as bloom flicker on tiny bright features. Weighting each tap
// by w = 1/(1 + max-channel) down-weights the bright outlier so it can't
// dominate, killing the flicker. We only pay this on the first downsample
// (u.z > 0.5) because that's where the raw fireflies live; deeper levels are
// already averaged smooth, so the cheaper /8 path runs there.

import package::bloom::io::FullscreenOut;
import package::bloom::io::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> u: vec4<f32>;   // xy = source texel size, z = karis firefly-suppress flag

fn karisW(c: vec3<f32>) -> f32 { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  let t = u.xy;
  let s0 = textureSample(tex, samp, i.uv).rgb;
  let s1 = textureSample(tex, samp, i.uv + vec2<f32>(-t.x, -t.y)).rgb;
  let s2 = textureSample(tex, samp, i.uv + vec2<f32>( t.x, -t.y)).rgb;
  let s3 = textureSample(tex, samp, i.uv + vec2<f32>(-t.x,  t.y)).rgb;
  let s4 = textureSample(tex, samp, i.uv + vec2<f32>( t.x,  t.y)).rgb;
  if (u.z > 0.5) {
    // Karis average: weight each tap by 1/(1+luma) so a single ultra-bright sub-pixel
    // firefly can't dominate — and thus can't swing — the mip texel as it drifts. Kills
    // the temporal bloom flicker on tiny bright features.
    let w0 = 4.0 * karisW(s0); let w1 = karisW(s1); let w2 = karisW(s2); let w3 = karisW(s3); let w4 = karisW(s4);
    let c = s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3 + s4 * w4;
    return vec4<f32>(c / max(w0 + w1 + w2 + w3 + w4, 0.0001), 1.0);
  }
  return vec4<f32>((s0 * 4.0 + s1 + s2 + s3 + s4) / 8.0, 1.0);
}
