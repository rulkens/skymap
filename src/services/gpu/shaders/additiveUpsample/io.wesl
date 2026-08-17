// additiveUpsample/io.wesl — shared structs for the offscreen-to-HDR
// upsample pass.
//
// The upsample pass mirrors the tone-map pass's shape (covering-triangle
// vertex stage emitting a UV, fragment stage sampling one texture).  We
// keep io minimal — just the vertex-to-fragment interface — because the
// fragment uses no uniform buffer (no exposure / curve knobs to thread).
//
// ## Why split into io/vertex/fragment
//
// Same rationale as the tone-map pass: each stage compiles a strictly-
// smaller GPUShaderModule from disjoint source, and the io module is the
// single authoritative source of the VSOut shape so a typo can't drift
// the vertex and fragment apart.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
