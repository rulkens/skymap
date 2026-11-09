// antiqueLook/ornaments.wesl — the placed-ornament record decor.wesl draws from:
// each a rect of the atlas (INK r, FILL g, WASH b) with its turn and pigment.
// Byte map mirrored by `packAntiqueOrnaments.ts`:
//
// | offset | field   | meaning                                         |
// | 0      | count   | rows in use                                     |
// | 16+64i | centre  | device px                                       |
// | +8     | half    | half extent, device px                          |
// | +16    | rot     | cos, sin of the CCW screen turn                 |
// | +24    | opacity |                                                 |
// | +28    | clears  | 1 = the fill clears the plate beneath to paper  |
// | +32    | rect    | atlas u0, v0, u1, v1                            |
// | +48    | pigment | index into PIGMENTS                             |
// | +52    | lettering | 1 = rect is on the lettering sheet (a title)  |
// | +56    | gridded | 1 = a sky figure: `grid` places its corners      |
// | +60    | washed  | 1 = flat pigment wash inside the outline (cartouche frame only) |
//
// After the 16 records, `grid`: per ornament 41 vec4 = 82 px points, of which the
// first 81 are its 9x9 lattice (row by row from the sprite's top left).

struct Ornament {
  centre: vec2<f32>,
  half: vec2<f32>,
  rot: vec2<f32>,
  opacity: f32,
  clears: f32,
  rect: vec4<f32>,
  pigment: f32,
  lettering: f32,
  gridded: f32,
  washed: f32,
}

struct AntiqueOrnaments {
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  items: array<Ornament, 16>,
  grid: array<vec4<f32>, 656>,
}
