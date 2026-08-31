// mcpm/traceUpsample.wesl — bilinear upsample of the reduced-res raymarch preview
// target into the HDR accum. Model: volpathBlit.wesl's accumulate-buffer resolve,
// simplified — the reduced target already carries fragment.wesl's exact linear-light
// emission (same shader, same output), so there is no mean or tonemap to redo here,
// just a sample; RenderGraph's LAYER_BLEND (one/one additive) does the actual add.
//
// Vertex stage is mcpm/vertex.wesl's shared 'vs' (McpmVsOut, +v DOWN) — the SAME
// module the reduced target was rendered with, so 'input.uv' samples it right side up
// with no flip.

import package::mcpm::vertex::McpmVsOut;

@group(0) @binding(0) var reduced: texture_2d<f32>;
@group(0) @binding(1) var reducedSampler: sampler;

@fragment
fn fs(input: McpmVsOut) -> @location(0) vec4<f32> {
  return textureSampleLevel(reduced, reducedSampler, input.uv, 0.0);
}
