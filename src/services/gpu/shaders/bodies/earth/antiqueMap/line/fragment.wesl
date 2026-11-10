// earth/antiqueMap/line/fragment.wesl — a border's dotted band or a river's ink for the
// quad vertex.wesl placed.

import package::bodies::earth::antiqueMap::io::AntiqueMapUniforms;
import package::bodies::earth::antiqueMap::line::io::LineOut;
import package::bodies::earth::antiqueMap::line::io::KIND_PROVINCE;
import package::bodies::earth::antiqueMap::line::io::KIND_RIVER;

@group(0) @binding(0) var<uniform> u: AntiqueMapUniforms;

// Dot spacing, print units.
const DOT_GAP: f32 = 2.6;

// A period river: one swelling line, double-banked with the water left paper
// once it is wide. A sub-pixel tremor keeps the bank from reading as a ruler's.
fn riverInk(dPx: f32, sPx: f32, halfPx: f32) -> f32 {
  let d = dPx + 0.12 * sin(sPx * 0.21) * min(1.0, 2.0 * halfPx);
  let solid = clamp(halfPx - d + 0.5, 0.0, 1.0);
  let bank = 0.45;
  let twin = clamp(bank - abs(d - (halfPx - bank)) + 0.5, 0.0, 1.0);
  return mix(solid, twin, smoothstep(1.1, 1.5, halfPx));
}

@fragment
fn fs(in: LineOut) -> @location(0) vec4<f32> {
  let pa = in.ends.xy;
  let pb = in.ends.zw;
  let span = pb - pa;
  let len2 = max(dot(span, span), 1e-6);
  let t = clamp(dot(in.clip.xy - pa, span) / len2, 0.0, 1.0);
  let dist = length(in.clip.xy - (pa + span * t));
  let fade = in.widths.w;
  let arcSpan = max(abs(in.arc.y - in.arc.x), 1e-6);
  let pxPerKm = sqrt(len2) / arcSpan;
  let arc = mix(in.arc.x, in.arc.y, t);
  let halfPx = max(mix(in.widths.x, in.widths.y, t), 0.5);
  if (in.kind == KIND_RIVER) {
    return vec4<f32>(0.0, 0.0, riverInk(dist, arc * pxPerKm, halfPx) * fade, 0.0);
  }
  let band = clamp(1.0 - dist / max(in.widths.z, 1.0), 0.0, 1.0);
  // Dots: the arc spacing whose screen gap is DOT_GAP units, as a power of two in km.
  let gapUnits = select(DOT_GAP, DOT_GAP * 0.7, in.kind == KIND_PROVINCE);
  let octave = log2(gapUnits * u.unitPx / pxPerKm);
  let spacing = exp2(ceil(octave));
  let k = round(arc / spacing);
  // Odd dots belong to the finer octave: they fade in as it nears.
  let odd = fract(k * 0.5) > 0.25;
  let arrive = select(1.0, smoothstep(0.0, 0.6, ceil(octave) - octave), odd);
  let along = (k * spacing - arc) * pxPerKm;
  let r = max(halfPx, 0.6) * arrive;
  let ink = 1.0 - smoothstep(r - 0.5, r + 0.5, length(vec2<f32>(along, dist)));
  return vec4<f32>(0.0, band * fade, ink * fade, 0.0);
}
