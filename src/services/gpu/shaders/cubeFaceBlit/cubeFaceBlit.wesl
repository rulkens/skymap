// cubeFaceBlit.wesl -- one capture face painted with a cube: each fragment
// derives its own view ray on the 90-degree square face and samples the cube
// along that ray rotated into the world. No depth, no blend: the sky is the
// first thing a probe face draws, and the host body is stamped over it.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

struct BlitUniforms {
  // World-from-view, columns (right, up, back): the face camera's 'poseBasis'.
  basis: mat3x3<f32>,
};

@group(0) @binding(0) var<uniform> blit: BlitUniforms;
@group(0) @binding(1) var skyCube: texture_cube<f32>;
@group(0) @binding(2) var skySampler: sampler;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  // 'fullscreenVertex' flips uv.y for texture space; undo it to get clip ndc.
  let ndc = vec2<f32>(in.uv.x * 2.0 - 1.0, 1.0 - in.uv.y * 2.0);
  // The face camera negates clip-Y ('cubemapFaceContext', flipClipY), so a ray
  // derived here must mirror the same axis or the host lights the deck.
  // tan(45 deg) = 1: on the square 90-degree face ndc IS the view-plane offset.
  let viewDir = normalize(vec3<f32>(ndc.x, -ndc.y, -1.0));
  let worldDir = blit.basis * viewDir;
  return textureSampleLevel(skyCube, skySampler, worldDir, 0.0);
}
