// antiqueLook/bodySigns/vertex.wesl — the sign a named planet or moon prints below a globe, in
// place of its glint: an open ring about a centre dot, inked as the star glyphs are
// and max-blended into the same `antique-star-ink` (r ink, g paper knock-out). One
// instanced quad per `AntiqueSigns` entry (`packAntiqueSigns.ts`).

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::bodySigns::io::SignOut;

struct AntiqueSigns {
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  centres: array<vec4<f32>, 32>,
}

@group(0) @binding(0) var<uniform> u: AntiqueUniforms;
@group(0) @binding(1) var<storage, read> signs: AntiqueSigns;
// The look's `mask` layer (`mask.wesl`): r body cover.
@group(0) @binding(2) var maskTex: texture_2d<f32>;

// Outer radius in print units: between a 4th- and 5th-magnitude star's glyph, so a
// planet reads as a mark of its own beside the stars.
const SIGN_RADIUS_UNITS: f32 = 4.0;

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> SignOut {
  var o: SignOut;
  o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
  if (ii >= signs.count) {
    return o;
  }
  let centre = signs.centres[ii].xy;
  // A body hidden behind a globe prints no sign (its glint was drawn without the body's depth).
  let maskDims = vec2<i32>(textureDimensions(maskTex));
  if (textureLoad(maskTex, clamp(vec2<i32>(centre), vec2<i32>(0), maskDims - 1), 0).r > 0.5) {
    return o;
  }
  let r = SIGN_RADIUS_UNITS * u.unit;
  let corner = vec2<f32>(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  let px = centre + corner * (1.3 * r + 2.0);
  o.pos = vec4<f32>(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
  o.centre = centre;
  o.r = r;
  return o;
}
