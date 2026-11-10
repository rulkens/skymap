// earth/antiqueMap/line/vertex.wesl — borders and rivers as screen-width lines on the
// globe, one instanced quad per segment, round-capped so a polyline's joints
// close under max blending. The vertex array is bound twice, one vertex apart,
// so instance i is the segment from vertex i to vertex i + 1; a strip's last
// vertex is flagged and its instance culled. Out: green, a border's proximity
// (1 on the line, 0 at the band's edge: the plate's outline-colour band); blue, ink.
//
// A border is dotted at a fixed arc spacing, a power of two in km chosen per
// segment so the dots sit ~DOT_GAP units apart: zooming in halves the spacing,
// so every old dot stays put and the new ones arrive between them, fading in.

import package::bodies::earth::antiqueMap::io::AntiqueMapUniforms;
import package::bodies::earth::antiqueMap::io::facing;
import package::bodies::earth::antiqueMap::io::clipToPx;
import package::bodies::earth::antiqueMap::io::pxToClip;
import package::bodies::earth::antiqueMap::io::lonLatToUnit;
import package::bodies::earth::antiqueMap::line::io::LineOut;
import package::bodies::earth::antiqueMap::line::io::KIND_REALM;
import package::bodies::earth::antiqueMap::line::io::KIND_PROVINCE;

@group(0) @binding(0) var<uniform> u: AntiqueMapUniforms;

// Style bits (`antiqueEarthMapFormat.ts`): width in 1/32 units, level, strip end.
const WIDTH_SCALE: f32 = 32.0;
const STRIP_END: u32 = 65536u;
// Outline-colour band half-widths, print units.
const BAND_REALM: f32 = 12.0;
const BAND_PROVINCE: f32 = 6.0;

fn culled() -> LineOut {
  var out: LineOut;
  out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  return out;
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) startAt: vec3<f32>,
  @location(1) startStyle: u32,
  @location(2) endAt: vec3<f32>,
  @location(3) endStyle: u32,
) -> LineOut {
  let level = f32((startStyle >> 12u) & 15u);
  let fade = clamp(u.detail - level, 0.0, 1.0);
  let a = lonLatToUnit(startAt.xy);
  let b = lonLatToUnit(endAt.xy);
  let ca = u.mvp * vec4<f32>(a, 1.0);
  let cb = u.mvp * vec4<f32>(b, 1.0);
  if ((startStyle & STRIP_END) != 0u || fade <= 0.0 || ca.w <= 0.0 || cb.w <= 0.0
      || facing(a, u.camLocal) < 0.0 || facing(b, u.camLocal) < 0.0) {
    return culled();
  }
  let kind = (startStyle >> 8u) & 15u;
  let pa = clipToPx(ca, u.viewportPx);
  let pb = clipToPx(cb, u.viewportPx);
  let wa = 0.5 * f32(startStyle & 255u) / WIDTH_SCALE * u.unitPx;
  let wb = 0.5 * f32(endStyle & 255u) / WIDTH_SCALE * u.unitPx;
  var band = 0.0;
  if (kind == KIND_REALM) {
    band = BAND_REALM * u.unitPx;
  } else if (kind == KIND_PROVINCE) {
    band = BAND_PROVINCE * u.unitPx;
  }
  let reach = max(max(wa, wb), band) + 1.0;
  let span = pb - pa;
  let len = length(span);
  let d = select(vec2<f32>(1.0, 0.0), span / len, len > 1e-4);
  let n = vec2<f32>(-d.y, d.x);
  // Two triangles: corner k → (end, side).
  let corner = array<vec2<f32>, 6>(
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
  )[vi % 6u];
  let atB = corner.x > 0.5;
  let base = select(pa, pb, atB);
  let px = base + n * corner.y * reach + d * select(-reach, reach, atB);
  let c = select(ca, cb, atB);
  var out: LineOut;
  out.clip = pxToClip(px, u.viewportPx, c.z, c.w);
  out.ends = vec4<f32>(pa, pb);
  out.arc = vec2<f32>(startAt.z, endAt.z);
  out.widths = vec4<f32>(wa, wb, band, fade);
  out.kind = kind;
  return out;
}
