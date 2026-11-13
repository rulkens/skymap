// earth/antiqueMap/sign/vertex.wesl — town signs and molehills: one instanced quad per
// sign, a fixed size in print units, anchored on the globe. Out: alpha, half the
// paper knocked out of the engraving beneath plus half the ink. Drawn in the
// bake's painter order (north to south, towns last) and REPLACING, so a nearer
// hill's body covers the one behind it; empty texels are discarded.

import package::bodies::earth::antiqueMap::io::AntiqueMapUniforms;
import package::bodies::earth::antiqueMap::io::facing;
import package::bodies::earth::antiqueMap::io::clipToPx;
import package::bodies::earth::antiqueMap::io::pxToClip;
import package::bodies::earth::antiqueMap::io::lonLatToUnit;
import package::bodies::earth::antiqueMap::glyphs::signFoot;
import package::bodies::earth::antiqueMap::sign::io::SignOut;

@group(0) @binding(0) var<uniform> u: AntiqueMapUniforms;

// Style bits (`antiqueEarthMapFormat.ts`): size in 1/4 units, kind, level.
const SIZE_SCALE: f32 = 4.0;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) lonLat: vec2<f32>,
  @location(1) style: u32,
) -> SignOut {
  var out: SignOut;
  let level = f32((style >> 16u) & 15u);
  let until = (style >> 20u) & 15u;
  // In over level..level+1; out over until..until+1 when `until` is set (a plan
  // sign takes over from the profile one).
  var fade = clamp(u.detail - level, 0.0, 1.0);
  if (until != 0u) {
    fade *= 1.0 - clamp(u.detail - f32(until), 0.0, 1.0);
  }
  let at = lonLatToUnit(lonLat);
  let c = u.mvp * vec4<f32>(at, 1.0);
  if (fade <= 0.0 || c.w <= 0.0 || facing(at, u.camLocal) < 0.0) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let sizeUnits = f32(style & 255u) / SIZE_SCALE;
  let corner = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
  )[vi % 6u];
  let kind = (style >> 8u) & 255u;
  let half = 0.5 * sizeUnits * u.unitPx + 1.0;
  // The sign's foot on the anchor: the quad's centre sits -foot half-sizes above it (y down).
  let centre = clipToPx(c, u.viewportPx) + vec2<f32>(0.0, signFoot(kind) * 0.5 * sizeUnits * u.unitPx);
  let px = centre + corner * half;
  out.clip = pxToClip(px, u.viewportPx, c.z, c.w);
  // Local y up, as the glyphs are drawn.
  out.local = vec2<f32>(corner.x, -corner.y) * half / (0.5 * sizeUnits * u.unitPx);
  // A seed from the position, so a sign keeps its variant across rebakes.
  let seed = fract(sin(dot(lonLat, vec2<f32>(1271.1, 3117.7))) * 43758.5453);
  out.params = vec3<f32>(sizeUnits * u.unitPx, seed, fade);
  out.kind = kind;
  return out;
}
