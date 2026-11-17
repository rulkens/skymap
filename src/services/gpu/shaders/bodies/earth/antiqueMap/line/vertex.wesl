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

@group(0) @binding(0) var<uniform> uniforms: AntiqueMapUniforms;

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
  @builtin(vertex_index) vertexIndex: u32,
  @location(0) startAt: vec3<f32>,
  @location(1) startStyle: u32,
  @location(2) endAt: vec3<f32>,
  @location(3) endStyle: u32,
) -> LineOut {
  let level = f32((startStyle >> 12u) & 15u);
  let fade = clamp(uniforms.detail - level, 0.0, 1.0);
  let startUnit = lonLatToUnit(startAt.xy);
  let endUnit = lonLatToUnit(endAt.xy);
  let startClip = uniforms.mvp * vec4<f32>(startUnit, 1.0);
  let endClip = uniforms.mvp * vec4<f32>(endUnit, 1.0);
  if ((startStyle & STRIP_END) != 0u || fade <= 0.0 || startClip.w <= 0.0 || endClip.w <= 0.0
      || facing(startUnit, uniforms.camLocal) < 0.0 || facing(endUnit, uniforms.camLocal) < 0.0) {
    return culled();
  }
  let kind = (startStyle >> 8u) & 15u;
  let startPx = clipToPx(startClip, uniforms.viewportPx);
  let endPx = clipToPx(endClip, uniforms.viewportPx);
  let startHalfWidthPx = 0.5 * f32(startStyle & 255u) / WIDTH_SCALE * uniforms.unitPx;
  let endHalfWidthPx = 0.5 * f32(endStyle & 255u) / WIDTH_SCALE * uniforms.unitPx;
  var band = 0.0;
  if (kind == KIND_REALM) {
    band = BAND_REALM * uniforms.unitPx;
  } else if (kind == KIND_PROVINCE) {
    band = BAND_PROVINCE * uniforms.unitPx;
  }
  let reach = max(max(startHalfWidthPx, endHalfWidthPx), band) + 1.0;
  let span = endPx - startPx;
  let len = length(span);
  let dir = select(vec2<f32>(1.0, 0.0), span / len, len > 1e-4);
  let sideDir = vec2<f32>(-dir.y, dir.x);
  // Two triangles: corner k → (end, side).
  let corner = array<vec2<f32>, 6>(
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
  )[vertexIndex % 6u];
  let atB = corner.x > 0.5;
  let base = select(startPx, endPx, atB);
  let cornerPx = base + sideDir * corner.y * reach + dir * select(-reach, reach, atB);
  let cornerClip = select(startClip, endClip, atB);
  var out: LineOut;
  out.clip = pxToClip(cornerPx, uniforms.viewportPx, cornerClip.z, cornerClip.w);
  out.ends = vec4<f32>(startPx, endPx);
  out.arc = vec2<f32>(startAt.z, endAt.z);
  out.widths = vec4<f32>(startHalfWidthPx, endHalfWidthPx, band, fade);
  out.kind = kind;
  return out;
}
