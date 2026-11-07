// antiqueLook/engraving.wesl — copperplate marks: burin hatching whose LINE WIDTH
// carries the tone (an engraver swells the line, never adds density), crossed
// hatching for the darks, and stipple for diffuse light. All in print units.

import package::antiqueLook::paper::vnoise;
import package::lib::util::hash21Hq;

// One family of parallel lines at `angle`. `tone` 0..1 sets the half-width as a
// share of `spacing`; the slow wobble is the hand, so lines are never ruled.
// `pxUnits` (units per device px) sets the anti-aliasing analytically, so the
// hatch takes no derivative and may run inside a branch (bodies only).
fn hatch(p: vec2<f32>, angle: f32, spacing: f32, tone: f32, pxUnits: f32) -> f32 {
  let n = vec2<f32>(-sin(angle), cos(angle));
  let along = dot(p, vec2<f32>(n.y, -n.x));
  let wobble = 0.22 * (vnoise(vec2<f32>(along * 0.015, dot(p, n) * 0.05)) - 0.5);
  let v = dot(p, n) / spacing + wobble;
  let d = abs(fract(v) - 0.5) * spacing;
  // A burin line swells and thins along its length (±15%, its own rhythm per
  // line) on top of the tone; below ~0.06 tone the burin lifts.
  let swell = 0.85 + 0.3 * vnoise(vec2<f32>(along * 0.035, floor(v) * 3.7));
  let halfWidth = clamp(tone, 0.0, 1.0) * spacing * 0.5 * swell;
  let aa = pxUnits;
  return (1.0 - smoothstep(halfWidth - aa * 0.5, halfWidth + aa * 0.5, d)) * smoothstep(0.03, 0.09, tone);
}

// Up to three crossing families; each joins only past its threshold, the way a
// plate is worked darker by re-cutting across the first lines.
fn crossHatch(p: vec2<f32>, tone: f32, spacing: f32, baseAngle: f32, pxUnits: f32) -> f32 {
  // Widths stay under ~0.7 of the spacing so the lozenges between crossings
  // keep their paper even in the darkest tone: engraving never floods.
  let first = hatch(p, baseAngle, spacing, tone * 0.72, pxUnits);
  // The crossing set at 45° makes lozenges; a shallower crossing makes moiré.
  // Crossed at ~50°, spacings a little apart, so the crossings never lock into
  // a screen-like lattice; the third set only flecks the deepest shade.
  let second = hatch(p, baseAngle + 0.87, spacing * 0.92, (tone - 0.35) * 0.95, pxUnits);
  let third = hatch(p, baseAngle - 0.7, spacing * 1.07, (tone - 0.8) * 0.8, pxUnits);
  // An ink DENSITY, not a coverage: where lines cross the ink lies twice, so a
  // crossing prints darker than either line (the plate multiplies it as Beer's law).
  return min(first + second + third, 1.05);
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

// A star glyph centred at the origin, after the Bayer/Flamsteed ladder: a disc
// for the faintest, then `rays` tapered points over a small core (from 8 up,
// alternate rays run short). `glory` adds a ring of ticks. `r` = ray length.
fn starGlyph(q: vec2<f32>, r: f32, rays: f32, glory: f32) -> f32 {
  let d = length(q);
  let a = atan2(q.y, q.x) + 1.5707963;
  // Alternate rays run short when there are 8 or more (4 long + 4 short, Bode).
  let lobe = abs(cos(0.5 * rays * a));
  let alt = cos(0.25 * rays * a);
  let spike = pow(lobe, 10.0 + rays) * select(1.0, select(0.62, 1.0, alt * alt > 0.5), rays >= 8.0);
  let core = r * select(1.0, 0.38, rays > 0.0);
  let edge = core + (r - core) * spike;
  var ink = 1.0 - smoothstep(edge - 0.45, edge + 0.45, d);
  let ticks = pow(abs(cos(12.0 * a)), 24.0);
  let ring = smoothstep(1.12 * r, 1.2 * r, d) * (1.0 - smoothstep(1.42 * r, 1.5 * r, d));
  ink = max(ink, ticks * ring * glory);
  return ink;
}

// The 17th-century Dutch coast halo: short horizontal strokes in the sea, densest
// against the shore and thinning out over `near` (1 at the coast, 0 far out).
fn coastHalo(p: vec2<f32>, near: f32, spacing: f32) -> f32 {
  let row = floor(p.y / spacing);
  let d = abs(fract(p.y / spacing) - 0.5) * spacing;
  let line = 1.0 - smoothstep(0.3, 0.85, d);
  let dash = vnoise(vec2<f32>(p.x * 0.11, row * 7.31));
  return line * step(1.0 - near * 0.95, dash) * step(0.04, near);
}
