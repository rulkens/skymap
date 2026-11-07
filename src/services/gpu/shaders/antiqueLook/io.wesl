// antiqueLook/io.wesl — the look's uniform record and the vertex→fragment struct.
// Byte map mirrored by `packAntiqueUniforms.ts` (the TS writer is authoritative).
//
// | offset | field   | meaning                                                  |
// | 0      | res     | target size, device px                                   |
// | 8      | unit    | device px per print unit (1 unit = 1 CSS px at 900 tall) |
// | 12     | flags   | bit0 bodies · bit1 captions · bit2 paper assets loaded   |
// | 16..79 | ray*    | world (equatorial) view-ray at the four corners, xyz     |
// | 80     | seed    | per-session paper seed                                   |

struct AntiqueUniforms {
  res: vec2<f32>,
  unit: f32,
  flags: u32,
  rayTL: vec4<f32>,
  rayTR: vec4<f32>,
  rayBL: vec4<f32>,
  rayBR: vec4<f32>,
  seed: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
