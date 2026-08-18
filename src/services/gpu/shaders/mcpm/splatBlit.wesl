// mcpm/splatBlit.wesl — cs_particles_blit and ps_particles_color fused into one fullscreen
// fragment pass. The fork's blit is a compute kernel writing a float texture that its quad
// shader then samples; the intermediate exists only to bridge the two, so this port drops
// it and draws the colour straight into the HDR accum target.
//
// The '10000' threshold is the fork's own, hardcoded in both halves rather than read from a
// uniform: a pixel carrying a data-point splat renders RED, everything below it takes the
// teal agent ramp scaled by sampleWeight. QUIRK kept verbatim — 1000+ agents on one pixel
// also reach 10000 and flip to red, indistinguishable from a galaxy.

import package::mcpm::vertex::McpmVsOut;

struct SplatBlit {
  screenWidth: u32,
  sampleWeight: f32,
};

@group(0) @binding(0) var<uniform> blit: SplatBlit;
// Plain u32, not atomic: the splat dispatch completes before this pass reads, and WGSL lets
// the same buffer carry a non-atomic element type in a different module (atomic<T> and T
// have identical size and layout).
@group(0) @binding(1) var<storage, read> splat: array<u32>;

@fragment
fn fs(input: McpmVsOut) -> @location(0) vec4<f32> {
  let px = vec2<u32>(input.pos.xy);
  let raw = f32(splat[px.y * blit.screenWidth + px.x]);

  // cs_particles_blit.hlsl:35-39 — the scale applies to the agent branch only.
  var v = raw;
  if (raw < 10000.0) { v = raw * blit.sampleWeight; }

  // ps_particles_color.hlsl:11-17. The exponential is unclamped upstream and stays so: it
  // is bounded in (0, 1) for any finite non-negative v anyway.
  if (v > 9999.0) {
    return vec4<f32>(1.0 - exp(-0.0001 * v), 0.0, 0.0, 1.0);
  }
  let a = v / 3.0;
  return vec4<f32>(0.6 * a, a, 0.7 * a, 1.0);
}
