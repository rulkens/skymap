// spherePick.wesl — flat sphere pick for the NEAR0 foreground bodies (Earth,
// planets, resolved scene-star spheres).
//
// The pick twin of the visual sphere stages (star/planet/earth vertex.wesl):
// same unit-sphere geometry, same 'clip_from_local' projection, but the
// fragment writes a 32-bit unsigned identity into an r32uint target instead of
// a colour. One module carries BOTH stages (vs + fsPick); bodyPickRenderer
// compiles it into its OWN GPUShaderModule for the sphere pipeline, never
// shared with the points pipeline (the WebGPU 'auto'-layout trap forbids
// sharing a compiled module across pipelines).
//
// ## Per-draw uniform (dynamic offset), not per-instance attributes
//
// Unlike the VISUAL planet stage — which instances every planet in one draw and
// reads a per-instance MVP so no mid-frame uniform exists to clobber — the pick
// contract records ONE sphere per 'drawSphere' call, each with its OWN packed
// id. bodyPickRenderer therefore binds this uniform through a 256-byte-aligned
// DYNAMIC OFFSET that advances per draw, so each of the <=10 sphere draws in a
// pass reads its OWN slot. A single shared slot written once per draw would lose
// to the writeBuffer-vs-submit race (every draw reading the last body's bytes);
// see bodyPickRenderer.ts for the full mechanism note.
//
// ## The identity is written RAW
//
// 'packedId' arrives fully packed from the CPU
// ('packSelection(sourceCode, seedIndex + PICK_SENTINEL_OFFSET)', composed by
// the body layers). This stage writes it unchanged — no packing math on the GPU
// (that lives in TS, so the source-code / seed-index encoding has one home).
//
// ## Byte layout (uniform std140)
//
//   offset  0..63  mvp       mat4x4<f32>  (column-major, 64 B)
//   offset 64..67  packedId  u32          (4 B)
//   struct size rounds up to 80 (the 16-byte alignment the mat4x4 demands; the
//   4 trailing bytes are pad). bodyPickRenderer's scratch mirrors this exactly:
//   f32[0..15] = mvp, u32[16] = packedId.

import package::lib::sphere::clip_from_local;

struct SpherePickUniforms {
  mvp: mat4x4<f32>,
  packedId: u32,
};

// Visible to BOTH stages: the vertex stage reads 'mvp', the fragment reads
// 'packedId'. Bound with 'hasDynamicOffset: true' so each draw selects its slot.
@group(0) @binding(0) var<uniform> u: SpherePickUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return clip_from_local(u.mvp, position);
}

@fragment
fn fsPick() -> @location(0) vec4<u32> {
  // r-channel carries the identity; g/b/a stay 0 so the output is well-defined
  // (only the r channel is read back on the JS side).
  return vec4<u32>(u.packedId, 0u, 0u, 0u);
}
