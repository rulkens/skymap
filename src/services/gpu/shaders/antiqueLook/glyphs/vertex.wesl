// antiqueLook/glyphs/vertex.wesl — the star glyphs, SCATTERED: one instanced quad per
// 'antique-print-points' texel, collapsed in the vertex stage unless the texel
// holds a catalogue star (shared/printPoint.wesl). A gather in the plate (25 cells per
// pixel) cost ~2 ms at 2800×1800; this touches only the pixels a glyph covers.
// Max-blended into `antique-star-ink`: r = glyph ink, g = its paper knock-out (1.3× radius).

import package::antiqueLook::io::AntiqueUniforms;
import package::antiqueLook::glyphs::io::GlyphOut;
import package::antiqueLook::glyphs::io::RAY_REACH;
import package::lib::util::hash21Hq;
import package::antiqueLook::shared::pigments::luma;

@group(0) @binding(0) var pointTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> u: AntiqueUniforms;
// The look's `mask` layer (`passes/maskFragment.wesl`): r body cover.
@group(0) @binding(2) var maskTex: texture_2d<f32>;
// The 1/16 glow and web level (`ANTIQUE_LOW_LAYERS`) and this frame's floors (`passes/skyFloor.wesl`):
// x the field's, y the web's median level.
@group(0) @binding(3) var lowTex: texture_2d_array<f32>;
@group(0) @binding(4) var<storage, read> floors: vec2<f32>;
const GLOW_LAYER: i32 = 0;
const WEB_LEVEL_LAYER: i32 = 2;

// A dot's radius in print units, faintest to brightest: a star's under the faintest
// glyph's; a galaxy's wider, so a cloud of bright members stands out of the field.
const STAR_DOT_RADIUS = vec2<f32>(0.45, 0.9);
const GALAXY_DOT_RADIUS = vec2<f32>(0.4, 1.6);
// Within this share of the screen's height of a resolved galaxy, the field's dots thin,
// fully within the inner ring and by 60% at the outer, so the clearing has no edge.
const FIELD_QUIET_REACH = vec2<f32>(0.05, 0.12);

// How near a resolved galaxy (the plate's `big` test on the glow, at the point and on
// two rings of four points round it) a field galaxy's dot stands: 1 on or beside one.
fn nearResolvedGalaxy(centre: vec2<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(lowTex));
  let c = centre / u.res * vec2<f32>(dims);
  let lo = 1.8 * floors.x + 0.03;
  let hi = 2.6 * floors.x + 0.05;
  var near = smoothstep(lo, hi, luma(textureLoad(lowTex, clamp(vec2<i32>(c), vec2<i32>(0), dims - 1), GLOW_LAYER, 0).rgb));
  for (var k = 0; k < 8; k++) {
    let ring = select(FIELD_QUIET_REACH.x, FIELD_QUIET_REACH.y, k >= 4);
    let a = f32(k) * 1.5707963 + select(0.0, 0.7853982, k >= 4);
    let q = clamp(vec2<i32>(c + vec2<f32>(cos(a), sin(a)) * ring * f32(dims.y)), vec2<i32>(0), dims - 1);
    let big = smoothstep(lo, hi, luma(textureLoad(lowTex, q, GLOW_LAYER, 0).rgb));
    near = max(near, big * select(1.0, 0.6, k >= 4));
  }
  return near;
}

// The web's levels (doublings of density, `passes/webFragment.wesl`) about the plate's median over
// which the field's dots thin, all but VOID_KEEP gone at the lower: graded, so walls read dense.
const VOID_LEVELS = vec2<f32>(-0.75, 1.0);
const VOID_KEEP: f32 = 0.06;

// The share of field galaxies the web's voids take here (`passes/webFragment.wesl` `fsLevel`; 0 off the cosmos).
fn voidThinning(centre: vec2<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(lowTex));
  let c = clamp(vec2<i32>(centre / u.res * vec2<f32>(dims)), vec2<i32>(0), dims - 1);
  let level = textureLoad(lowTex, c, WEB_LEVEL_LAYER, 0).rg;
  let ramp = floors.y + VOID_LEVELS;
  return (1.0 - VOID_KEEP) * (1.0 - smoothstep(ramp.x, ramp.y, level.x)) * level.y;
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> GlyphOut {
  var o: GlyphOut;
  o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
  let dims = vec2<u32>(textureDimensions(pointTex));
  let cell = vec2<u32>(ii % dims.x, ii / dims.x);
  if (cell.y >= dims.y) {
    return o;
  }
  let s = textureLoad(pointTex, vec2<i32>(cell), 0);
  if (s.w < 0.5) {
    return o;
  }
  let centre = vec2<f32>(s.x * 0.5 + 0.5, 0.5 - s.y * 0.5) * u.res;
  // A star behind a body never prints: its point was drawn without the body's depth.
  let maskDims = vec2<i32>(textureDimensions(maskTex));
  if (textureLoad(maskTex, min(vec2<i32>(centre), maskDims - 1), 0).r > 0.5) {
    return o;
  }
  // Seven classes by apparent magnitude, one per whole magnitude as Hevelius
  // and Flamsteed graded theirs: dots for the faintest three (m 5, 4, 3), then
  // 6, 8 and 8 rays, and 8 long with 8 short for Sirius and Canopus. A rayed
  // star's core (half its size) outgrows the largest dot, so every step reads.
  let radii = array<f32, 7>(1.0, 1.5, 2.1, 4.4, 5.4, 6.6, 8.0);
  let rayCounts = array<f32, 7>(0.0, 0.0, 0.0, 6.0, 8.0, 8.0, 16.0);
  let rank = 5 - clamp(i32(round(s.z)), -1, 5);
  // Each star punched by hand: its own turn, and a slight unevenness of size.
  // A dot (shared/printPoint.wesl: w 2 a galaxy, 3 a faint star) swells with its weight, off the ladder.
  let isDot = s.w > 1.5;
  let dotRadius = select(GALAXY_DOT_RADIUS, STAR_DOT_RADIUS, s.w > 2.5);
  // Round a resolved galaxy most field galaxies go and the rest shrink, so the
  // subject is not lost in a speckle as loud as itself; a void empties of them
  // too, so the web's walls carry the field. Stars keep every dot.
  var quiet = 0.0;
  if (isDot && s.w < 2.5) {
    quiet = nearResolvedGalaxy(centre);
    if (hash21Hq(floor(centre) + 29.3) < max(0.7 * quiet, voidThinning(centre))) {
      return o;
    }
  }
  let size = select(radii[rank], mix(dotRadius.x, dotRadius.y, s.z * s.z) * (1.0 - 0.35 * quiet), isDot);
  let r = size * u.unit * (0.92 + 0.16 * hash21Hq(floor(centre) + 7.1));
  let rays = select(rayCounts[rank], 0.0, isDot);
  let reach = select(1.5, RAY_REACH, rays > 0.0) * r + 2.0;
  let corner = vec2<f32>(f32(vi & 1u), f32((vi >> 1u) & 1u)) * 2.0 - 1.0;
  let px = centre + corner * reach;
  o.pos = vec4<f32>(px.x / u.res.x * 2.0 - 1.0, 1.0 - px.y / u.res.y * 2.0, 0.0, 1.0);
  o.centre = centre;
  o.shape = vec4<f32>(r, rays, 0.0, hash21Hq(floor(centre)) * 6.2831853);
  return o;
}
