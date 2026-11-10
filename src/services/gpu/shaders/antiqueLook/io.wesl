// antiqueLook/io.wesl — the look's uniform record and the vertex→fragment struct.
// This table is the byte map; `packAntiqueUniforms.ts` writes it.
//
// | offset | field   | meaning                                                  |
// | 0      | res     | target size, device px                                   |
// | 8      | unit    | device px per print unit (1 unit = 1 CSS px at 900 tall) |
// | 12     | flags   | bit1 captions · bit2 paper assets loaded ·               |
// |        |         | bit3 cover read off foreground:0 depth (`passes/maskFragment.wesl`) ·   |
// |        |         | bit4 the relief row holds Mars ground (`passes/reliefFragment.wesl`)    |
// | 16..79 | ray*    | world (equatorial) view-ray at the four corners, xyz     |
// | 28     | web     | rayTL.w: how far the cosmic web is charted, 0..1         |
// | 44..76 | eye     | rayTR.w, rayBL.w, rayBR.w: the eye, world Mpc            |
// | 80     | seed    | per-session paper seed                                   |
// | 84     | hatch   | body hatch angle, radians: parallel to the terminator    |
// | 88     | borderWash | debug panel: the border band's gamboge                |
// | 92     | subject | how far the Moon is the plate's subject: the chart fades |
// | 96     | sky     | the sky's ruling frame (`RulingFrame`, 80 bytes)         |
// | 176    | globe   | a globe's ruling frame; all zero when none is ruled      |
// | 256    | tune    | debug panel: hatch spacing (units), wash gain, ink gain, |
// |        |         | line ink                                                 |
// | 272    | tint    | debug panel: multiplies the sheet                        |
// | 284    | hidden  | debug panel: rows switched off (passes/plateFragment.wesl `HIDE_*`)  |
// | 288    | letterWear | debug panel: 0 clean anti-aliased letters, 1 worn     |

// One frame the plate is ruled and numbered in (`AntiqueRulingFrame`), axes in world.
struct RulingFrame {
  lon0: vec4<f32>, // xyz the axis at longitude 0; w degrees added before ruling (prime meridian)
  lon90: vec4<f32>, // xyz the axis at longitude 90° east; w the interior net's ink, 0..1
  pole: vec4<f32>, // xyz the north pole
  globe: vec4<f32>, // xyz eye → the globe's centre, in its radii (a globe's frame only)
  steps: vec4<f32>, // degrees: lon, lat interval; lon, lat ladder cell. 0 = no frame
}

struct AntiqueUniforms {
  res: vec2<f32>,
  unit: f32,
  flags: u32,
  rayTL: vec4<f32>,
  rayTR: vec4<f32>,
  rayBL: vec4<f32>,
  rayBR: vec4<f32>,
  seed: f32,
  hatchAngle: f32,
  borderWash: f32,
  subject: f32,
  sky: RulingFrame,
  globe: RulingFrame,
  tune: vec4<f32>,
  tint: vec3<f32>,
  hidden: u32,
  letterWear: f32,
}

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}
