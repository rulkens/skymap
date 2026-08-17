// pickDebugOverlay/io.wesl — shared structs for the pick-buffer debug
// overlay's covering-triangle fullscreen pass.
//
// The overlay reads the r32uint pick texture and writes a colour-
// mapped RGBA frame on top of the tone-mapped swap chain.  Same
// vertex-stage shape as toneMap / additiveUpsample: a single VSOut
// carrying the clip-space position and a [0, 1]² UV.
//
// ## Why split into io / vertex / fragment
//
// Matches the project convention — each stage compiles a strictly-
// smaller GPUShaderModule from disjoint source, and the io module
// is the single authoritative source of the VSOut shape so a typo
// can't drift the vertex and fragment apart.

struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
