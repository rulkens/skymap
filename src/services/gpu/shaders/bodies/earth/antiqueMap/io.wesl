// earth/antiqueMap/io.wesl — the antique look's geography row on Earth: realm
// fills, border and river lines, town and relief signs, all drawn on the unit
// globe through Earth's own slab MVP. `packAntiqueMapUniforms.ts` writes this.
//
// | offset | field      | meaning                                             |
// | 0      | mvp        | unit-sphere local → clip, Earth's slab row          |
// | 64     | camLocal   | the eye in the unit-sphere frame                    |
// | 76     | unitPx     | device px per print unit                            |
// | 80     | viewportPx | target size, device px                              |
// | 88     | detail     | the reveal level the zoom has reached (fractional)  |
// | 92     | radiusKm   | the globe's radius, km (arc lengths are in km)      |

struct AntiqueMapUniforms {
  mvp: mat4x4<f32>,
  camLocal: vec3<f32>,
  unitPx: f32,
  viewportPx: vec2<f32>,
  detail: f32,
  radiusKm: f32,
}

// A geodetic lon/lat (radians) on the unit globe, the mesh's axes (`lonLatDegToDirection`).
fn lonLatToUnit(lonLat: vec2<f32>) -> vec3<f32> {
  let c = cos(lonLat.y);
  return vec3<f32>(c * cos(lonLat.x), c * sin(lonLat.x), sin(lonLat.y));
}

// > 0 where a point of the unit globe faces the eye: the far side is culled per
// vertex and per fragment (the row has no depth; the globe is convex).
fn facing(p: vec3<f32>, cam: vec3<f32>) -> f32 {
  return dot(p, cam - p);
}

// Clip → framebuffer px (y down, as `@builtin(position)` reads in the fragment).
fn clipToPx(c: vec4<f32>, viewport: vec2<f32>) -> vec2<f32> {
  let ndc = c.xy / c.w;
  return vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * viewport;
}

fn pxToClip(px: vec2<f32>, viewport: vec2<f32>, z: f32, w: f32) -> vec4<f32> {
  let ndc = vec2<f32>(px.x / viewport.x * 2.0 - 1.0, 1.0 - px.y / viewport.y * 2.0);
  return vec4<f32>(ndc * w, z, w);
}
