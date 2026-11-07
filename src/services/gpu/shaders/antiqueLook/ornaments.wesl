// antiqueLook/ornaments.wesl — the record of the plate's engraved decorations: cartouche,
// compass rose, and the beasts of the sky. Each is a rect of the ornament atlas
// whose channels are INK (r), FILL (g, the solid silhouette) and WASH (b); the
// hue comes from the instance's pigment so ornaments stay inside the palette.
// The loop lives in fragment.wesl: WESL bindings are module-local, and a
// uniform struct is never passed by value (RENDERER.md's Adreno landmine).
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

struct Ornament {
  centre: vec2<f32>,
  half: vec2<f32>,
  rot: vec2<f32>,
  opacity: f32,
  clears: f32,
  rect: vec4<f32>,
  pigment: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}

struct AntiqueOrnaments {
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  items: array<Ornament, 16>,
}
