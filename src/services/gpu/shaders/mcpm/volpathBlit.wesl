// mcpm/volpathBlit.wesl — the path tracer's accumulator resolved into the HDR target:
// cs_volpath_blit and ps_volpath fused into one fullscreen fragment pass, exactly as
// splatBlit.wesl fuses the fork's particle pair. The fork's intermediate storage texture
// existed only to bridge a compute blit to a quad shader, and nothing here needs it.
//
// DIVERGENCE: volpath.wesl SUMS its samples, so the mean is taken here — '.a' is the
// sample count, not the fork's running-average weight of 1.

import package::mcpm::vertex::McpmVsOut;

struct VolpathBlit {
  screenWidth: u32,
  exposure: f32,
  // 1 = the samples were already tonemapped before accumulation, so not again here.
  compressive: u32,
};

@group(0) @binding(0) var<uniform> blit: VolpathBlit;
// Plain read of the kernel's read_write buffer: the compute pass completes before this
// one reads, and the two access modes are layout-identical.
@group(0) @binding(1) var<storage, read> accum: array<vec4<f32>>;

fn tonemap(L: vec3<f32>, exposure: f32) -> vec3<f32> {
  return vec3<f32>(1.0) - exp(-exposure * L);
}

@fragment
fn fs(input: McpmVsOut) -> @location(0) vec4<f32> {
  let px = vec2<u32>(input.pos.xy);
  let acc = accum[px.y * blit.screenWidth + px.x];
  // A cleared accumulator carries no samples; the mean is undefined, not black-with-noise.
  if (acc.a < 1.0) {
    return vec4<f32>(0.0);
  }

  let L = acc.rgb / acc.a;
  let rgb = select(tonemap(L, blit.exposure), L, blit.compressive == 1u);
  // Emission only, alpha 0 so the layers beneath are never occluded — fragment.wesl's
  // additive branch does the same.
  return vec4<f32>(rgb, 0.0);
}
