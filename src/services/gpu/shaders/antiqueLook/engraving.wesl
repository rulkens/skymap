// antiqueLook/engraving.wesl — copperplate marks: burin hatching whose LINE WIDTH
// carries the tone (an engraver swells the line, never adds density), crossed
// hatching for the darks, and stipple for diffuse light. All in print units.

import package::antiqueLook::paper::vnoise;
import package::lib::util::hash21Hq;

// One family of parallel lines at `angle`. `tone` 0..1 sets the half-width as a
// share of `spacing`; the slow wobble is the hand, so lines are never ruled.
fn hatch(p: vec2<f32>, angle: f32, spacing: f32, tone: f32) -> f32 {
  let n = vec2<f32>(-sin(angle), cos(angle));
  let along = dot(p, vec2<f32>(n.y, -n.x));
  let wobble = 0.22 * (vnoise(vec2<f32>(along * 0.015, dot(p, n) * 0.05)) - 0.5);
  let v = dot(p, n) / spacing + wobble;
  let d = abs(fract(v) - 0.5) * spacing;
  // Lines taper out rather than end: below ~0.06 tone the burin lifts.
  let halfWidth = clamp(tone, 0.0, 1.0) * spacing * 0.5;
  let aa = max(fwidth(v) * spacing, 0.6);
  return (1.0 - smoothstep(halfWidth - aa * 0.5, halfWidth + aa * 0.5, d)) * smoothstep(0.03, 0.09, tone);
}

// Up to three crossing families; each joins only past its threshold, the way a
// plate is worked darker by re-cutting across the first lines.
fn crossHatch(p: vec2<f32>, tone: f32, spacing: f32, baseAngle: f32) -> f32 {
  let first = hatch(p, baseAngle, spacing, tone * 1.15);
  let second = hatch(p, baseAngle + 1.05, spacing, (tone - 0.42) * 1.6);
  let third = hatch(p, baseAngle - 0.5, spacing * 0.8, (tone - 0.75) * 2.2);
  return max(first, max(second, third));
}

// Jittered-grid dots: the dot AREA tracks the tone, as in stipple engraving.
fn stipple(p: vec2<f32>, cell: f32, tone: f32) -> f32 {
  let c = floor(p / cell);
  var ink = 0.0;
  for (var j = 0; j <= 1; j++) {
    for (var i = 0; i <= 1; i++) {
      let k = c + vec2<f32>(f32(i), f32(j)) - vec2<f32>(0.5);
      let kc = floor(k + 0.5);
      let centre = (kc + vec2<f32>(hash21Hq(kc), hash21Hq(kc + 17.3))) * cell;
      let r = sqrt(clamp(tone, 0.0, 1.0)) * cell * 0.52;
      let d = length(p - centre);
      ink = max(ink, 1.0 - smoothstep(r - 0.45, r + 0.45, d));
    }
  }
  return ink * step(0.02, tone);
}

// A star glyph centred at the origin: a disc for faint stars, a six-rayed
// engraved star for bright ones (Flamsteed / Bode convention). `r` in units.
fn starGlyph(q: vec2<f32>, r: f32, rays: f32) -> f32 {
  let d = length(q);
  let a = atan2(q.y, q.x);
  let spike = pow(abs(cos(3.0 * a)), 12.0) * rays;
  let edge = r * (1.0 + 1.25 * spike);
  return 1.0 - smoothstep(edge - 0.5, edge + 0.5, d);
}
