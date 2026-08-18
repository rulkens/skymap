// mcpm/splatBlit.wesl — cs_particles_blit and ps_particles_color fused into one fullscreen
// fragment pass. The fork's blit is a compute kernel writing a float texture that its quad
// shader then samples; the intermediate exists only to bridge the two, so this port drops
// it and draws the colour straight into the HDR accum target.
//
// DELIBERATE FORK DIVERGENCE (user directive): the fork's '10000' threshold — a pixel
// carrying a data-point splat renders RED, everything below takes the teal agent ramp — is
// gone along with the data-point splat itself (splatTransform.wesl). The catalog is its own
// Galaxies layer in this tool, so one continuous ramp is all that is left to draw, and the
// fork's quirk of 1000+ agents on a pixel flipping to red goes with it.

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

  // cs_particles_blit.hlsl:35-39 then ps_particles_color.hlsl:11-17, agent branch only.
  let a = raw * blit.sampleWeight / 3.0;
  return vec4<f32>(0.6 * a, a, 0.7 * a, 1.0);
}
