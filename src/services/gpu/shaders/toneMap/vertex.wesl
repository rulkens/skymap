// toneMap/vertex.wesl — fullscreen 'covering triangle' vertex stage.
//
// This is the smallest vertex stage in the engine: no per-vertex
// inputs, no uniforms, no bindings of any kind. The vs() entry
// point synthesises clip-space positions and matching UVs directly
// from the built-in 'vertex_index', drawing a single triangle whose
// three vertices sit at (-1,-1), (3,-1), (-1,3) in clip space.
// That triangle covers the entire viewport [-1, 1]² with a 50%
// overdraw budget that's free because we never sample those off-
// screen pixels.
//
// ## Why a covering triangle, not a quad
//
// The classic post-process geometry is a fullscreen quad — two
// triangles meeting at a shared edge through the centre of the
// viewport. That edge is a problem: GPUs rasterise triangle pairs
// independently and the rasteriser's centre-sample rule can drop
// pixels right on the shared edge depending on sub-pixel positions.
// A single covering triangle has no shared edge inside the viewport,
// so every pixel is unambiguously inside exactly one triangle.
// The off-screen overdraw beyond [-1, 1]² is free — the GPU's clip
// hardware discards those fragments before fragment shading.

import package::toneMap::io::VSOut;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  // Standard 'big triangle' trick: vertex indices 0,1,2 produce UVs
  // (0,0), (2,0), (0,2) which map to clip-space positions (-1,1),
  // (3,1), (-1,-3) — a single triangle that covers [-1,1]² with the
  // off-screen corners safely clipped.
  let x = f32(((vi << 1u) & 2u));
  let y = f32(vi & 2u);
  var out: VSOut;
  out.clip = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  out.uv = vec2<f32>(x, y);
  return out;
}
