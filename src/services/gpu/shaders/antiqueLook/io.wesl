// antiqueLook/io.wesl — the look's uniform record and the vertex→fragment struct.
// This table is the byte map; `packAntiqueUniforms.ts` writes it.
//
// | offset | field   | meaning                                                  |
// | 0      | res     | target size, device px                                   |
// | 8      | unit    | device px per print unit (1 unit = 1 CSS px at 900 tall) |
// | 12     | flags   | bit0 bodies · bit1 captions · bit2 paper assets loaded   |
// | 16..79 | ray*    | world (equatorial) view-ray at the four corners, xyz     |
// | 80     | seed    | per-session paper seed                                   |
// | 84     | raStep  | RA ruling interval, degrees (one for the whole plate)    |
// | 88     | decStep | Dec ruling interval, degrees                             |
// | 92     | hatch   | body hatch angle, radians: parallel to the terminator    |

struct AntiqueUniforms {
  res: vec2<f32>,
  unit: f32,
  flags: u32,
  rayTL: vec4<f32>,
  rayTR: vec4<f32>,
  rayBL: vec4<f32>,
  rayBR: vec4<f32>,
  seed: f32,
  raStep: f32,
  decStep: f32,
  hatchAngle: f32,
}

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
