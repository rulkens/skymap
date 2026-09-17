// splat/io.wesl — the packed splat record and the varyings the quad hands its fragment.
// Word map is packSplats.ts's: w3 rot i8x4 [x,y,z,w]; w4 logScale.xy f16x2;
// w5 = logScale.z f16 in the low half + opacity u8 at byte 22 (third byte);
// w6 = dcColor u8x3.

const WORDS_PER_SPLAT: u32 = 7u;
const WORDS_PER_SH1: u32 = 3u;

struct Splat {
  positionM: vec3<f32>,
  rotation: vec4<f32>,
  scaleM: vec3<f32>,
  opacity: f32,
  color: vec3<f32>,
};

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) color: vec3<f32>,
  @location(1) @interpolate(flat) alpha: f32,
  @location(2) @interpolate(flat) conic: vec3<f32>,
  @location(3) dPx: vec2<f32>,
};
