// earth/antiqueMap/townSigns.wesl — town signs, ported from the cities research
// (validated with naga there).
//
// Town signs for the antique Earth plate, after the settlement signs of Visscher's
// Comitatus Hollandiae (1690): walled towns drawn in plan, villages as a little church
// in profile, the profile tower group on a locator ring for small-scale maps.
// uv is the sprite's local square in [-1, 1], y UP; pxPerUnit = sprite half-size in px.
// Returns (ink coverage, paper knock-out coverage). Lines never thin below ~0.85 px so a
// sign does not shimmer while the globe turns; hatching melts to a flat tone below ~2 px.
// The low 4 bits of `kind` pick the sign, bit 4 adds a cross (bishopric), bit 5 a double
// cross (archbishopric) on top, as Lubin's Mercure geographique (1678) describes.

const SIGN_CAPITAL: u32 = 0u;
const SIGN_CITY_PLAN: u32 = 1u;
const SIGN_FORTRESS: u32 = 2u;
const SIGN_TOWN: u32 = 3u;
const SIGN_VILLAGE: u32 = 4u;
const SIGN_HAMLET: u32 = 5u;
const SIGN_SEE_BISHOP: u32 = 16u;
const SIGN_SEE_ARCHBISHOP: u32 = 32u;

const SIGN_HALO_PX: f32 = 1.5;
const SIGN_PI: f32 = 3.14159265;

fn signCov(dist: f32, ppu: f32) -> f32 {
  return clamp(0.5 - dist * ppu, 0.0, 1.0);
}

fn signStroke(dist: f32, width: f32, ppu: f32) -> f32 {
  return signCov(abs(dist) - 0.5 * width, ppu);
}

fn signBox(point: vec2<f32>, center: vec2<f32>, halfSize: vec2<f32>) -> f32 {
  let excess = abs(point - center) - halfSize;
  return length(max(excess, vec2<f32>(0.0))) + min(max(excess.x, excess.y), 0.0);
}

fn signSegment(point: vec2<f32>, start: vec2<f32>, end: vec2<f32>) -> f32 {
  let toPoint = point - start;
  let segVec = end - start;
  let alongT = clamp(dot(toPoint, segVec) / dot(segVec, segVec), 0.0, 1.0);
  return length(toPoint - segVec * alongT);
}

// Isosceles triangle, apex at `apex`, pointing up, base `height` below with half-width `halfWidth` (iq).
fn signSpire(point: vec2<f32>, apex: vec2<f32>, halfWidth: f32, height: f32) -> f32 {
  let baseCorner = vec2<f32>(halfWidth, -height);
  var apexRel = point - apex;
  apexRel.x = abs(apexRel.x);
  let toSide = apexRel - baseCorner * clamp(dot(apexRel, baseCorner) / dot(baseCorner, baseCorner), 0.0, 1.0);
  let toBase = apexRel - baseCorner * vec2<f32>(clamp(apexRel.x / baseCorner.x, 0.0, 1.0), 1.0);
  let winding = -sign(baseCorner.y);
  let dists = min(vec2<f32>(dot(toSide, toSide), winding * (apexRel.x * baseCorner.y - apexRel.y * baseCorner.x)), vec2<f32>(dot(toBase, toBase), winding * (apexRel.y - baseCorner.y)));
  return -sqrt(dists.x) * sign(dists.y);
}

// Regular n-point star, one point up (iq's sdStar); indent in [2, points], points means a plain polygon.
fn signStar(point: vec2<f32>, radius: f32, points: f32, indent: f32) -> f32 {
  let halfAngle = SIGN_PI / points;
  let indentAngle = SIGN_PI / indent;
  let outerCs = vec2<f32>(cos(halfAngle), sin(halfAngle));
  let indentCs = vec2<f32>(cos(indentAngle), sin(indentAngle));
  let angle = atan2(point.x, point.y);
  let foldedAngle = angle - 2.0 * halfAngle * floor(angle / (2.0 * halfAngle)) - halfAngle;
  var folded = length(point) * vec2<f32>(cos(foldedAngle), abs(sin(foldedAngle)));
  folded = folded - radius * outerCs;
  folded = folded + indentCs * clamp(-dot(folded, indentCs), 0.0, radius * outerCs.y / indentCs.y);
  return length(folded) * sign(folded.x);
}

// Parallel engraved lines along `dir`, `spacing` apart; a flat tone of the same density when too fine.
fn signHatch(point: vec2<f32>, dir: vec2<f32>, spacing: f32, width: f32, ppu: f32) -> f32 {
  let lineDist = abs(fract(dot(point, dir) / spacing) - 0.5) * spacing;
  return mix(width / spacing, signCov(lineDist - 0.5 * width, ppu), smoothstep(1.8, 3.0, spacing * ppu));
}

// The walled town's rim: a circle toothed with eight small bastions.
fn signPlanRim(point: vec2<f32>) -> f32 {
  let bastions = 8.0;
  let turn = atan2(point.x, point.y) * bastions / (2.0 * SIGN_PI);
  let tooth = 1.0 - 2.0 * abs(fract(turn) - 0.5);
  return length(point) - (0.55 + 0.11 * tooth);
}

// A tower of `halfWidth` and `height` standing on `foot`, its spire `spireHeight` tall (SDF).
fn signTower(point: vec2<f32>, centerX: f32, foot: f32, halfWidth: f32, height: f32, spireHeight: f32) -> f32 {
  let body = signBox(point, vec2<f32>(centerX, foot + 0.5 * height), vec2<f32>(halfWidth, 0.5 * height));
  return min(body, signSpire(point, vec2<f32>(centerX, foot + height + spireHeight), halfWidth + 0.03, spireHeight));
}

// A gabled house in profile: walls `height` tall under a roof `roofHeight` tall (SDF).
fn signHouse(point: vec2<f32>, centerX: f32, foot: f32, halfWidth: f32, height: f32, roofHeight: f32) -> f32 {
  let walls = signBox(point, vec2<f32>(centerX, foot + 0.5 * height), vec2<f32>(halfWidth, 0.5 * height));
  return min(walls, signSpire(point, vec2<f32>(centerX, foot + height + roofHeight), halfWidth + 0.04, roofHeight));
}

fn townSign(uv: vec2<f32>, kind: u32, pxPerUnit: f32) -> vec2<f32> {
  let ppu = pxPerUnit;
  let lineWidth = max(0.085, 0.85 / ppu);
  let hair = max(0.05, 0.6 / ppu);
  let base = kind & 15u;
  var ink = 0.0;
  var sil = 1e3;
  var top = 0.62;

  if (base == SIGN_CITY_PLAN) {
    let rim = signPlanRim(uv);
    let streets = max(signHatch(uv, vec2<f32>(0.8, 0.6), 0.2, hair, ppu),
                      signHatch(uv, vec2<f32>(-0.6, 0.8), 0.2, hair, ppu));
    ink = max(signStroke(rim, lineWidth, ppu), streets * signCov(rim + 0.06, ppu));
    sil = rim;
    top = 0.6;
  } else if (base == SIGN_FORTRESS) {
    let rampart = signStar(uv, 0.62, 5.0, 3.2);
    let glacis = rampart - 0.13;
    let core = length(uv) - 0.1;
    ink = max(max(signStroke(rampart, lineWidth, ppu), signStroke(glacis, hair, ppu)), signCov(core, ppu));
    sil = glacis;
    top = 0.6;
  } else if (base == SIGN_HAMLET) {
    let ring = length(uv) - 0.4;
    ink = max(signStroke(ring, lineWidth, ppu), signCov(length(uv) - 0.13, ppu));
    sil = ring;
    top = 0.4;
  } else {
    // Profile signs: hatched towers among gabled houses, standing on
    // the ground (village) or on a locator ring (town; the capital's ring carries a prick).
    var foot = -0.46;
    var towers = 1e3;
    var houses = 1e3;
    var ground = 1e3;
    if (base == SIGN_VILLAGE) {
      foot = -0.5;
      towers = signTower(uv, -0.22, foot, 0.12, 0.62, 0.42);
      houses = signHouse(uv, 0.18, foot, 0.22, 0.3, 0.26);
      ground = signSegment(uv, vec2<f32>(-0.5, foot), vec2<f32>(0.5, foot));
      top = 0.54;
    } else if (base == SIGN_CAPITAL) {
      // Two battlemented towers flank the spire: each a box with a notch cut from its top.
      let mirrored = vec2<f32>(abs(uv.x), uv.y);
      let keep = max(signBox(mirrored, vec2<f32>(0.4, foot + 0.25), vec2<f32>(0.11, 0.25)),
                     -signBox(mirrored, vec2<f32>(0.4, foot + 0.5), vec2<f32>(0.04, 0.06)));
      towers = min(signTower(uv, 0.0, foot, 0.12, 0.7, 0.38), keep);
      houses = signBox(uv, vec2<f32>(0.0, foot + 0.13), vec2<f32>(0.4, 0.13));
      ink = signCov(length(uv - vec2<f32>(0.0, -0.66)) - 0.06, ppu);
      top = 0.62;
    } else {
      towers = signTower(uv, 0.0, foot, 0.11, 0.66, 0.42);
      houses = min(signHouse(uv, -0.3, foot, 0.15, 0.26, 0.24), signHouse(uv, 0.3, foot, 0.15, 0.26, 0.24));
      top = 0.62;
    }
    var footSil = ground - 0.5 * lineWidth;
    if (base != SIGN_VILLAGE) {
      footSil = length(uv - vec2<f32>(0.0, -0.66)) - 0.16;
      ground = abs(footSil);
    }
    let group = min(towers, houses);
    let shade = signHatch(uv, vec2<f32>(1.0, 0.0), 0.12, hair, ppu) * signCov(towers, ppu);
    let lines = max(signStroke(group, lineWidth, ppu), signStroke(towers, lineWidth, ppu));
    ink = max(ink, max(max(lines, shade), signCov(ground - 0.5 * lineWidth, ppu)));
    sil = min(group, footSil);
  }

  let flags = kind & (SIGN_SEE_BISHOP | SIGN_SEE_ARCHBISHOP);
  if (flags != 0u) {
    let crossTopY = top + 0.34;
    var cross = signSegment(uv, vec2<f32>(0.0, top), vec2<f32>(0.0, crossTopY));
    cross = min(cross, signSegment(uv, vec2<f32>(-0.1, crossTopY - 0.1), vec2<f32>(0.1, crossTopY - 0.1)));
    if ((flags & SIGN_SEE_ARCHBISHOP) != 0u) {
      cross = min(cross, signSegment(uv, vec2<f32>(-0.14, crossTopY - 0.2), vec2<f32>(0.14, crossTopY - 0.2)));
    }
    ink = max(ink, signCov(cross - 0.5 * lineWidth, ppu));
    sil = min(sil, cross - 0.5 * lineWidth);
  }

  // Paper clears a halo around the sign's silhouette, kept inside the sprite.
  let edge = max(abs(uv.x), abs(uv.y)) - 1.0;
  let knock = signCov(sil - SIGN_HALO_PX / ppu, ppu) * signCov(edge, ppu);
  return vec2<f32>(ink, max(knock, ink));
}

// Hand-colour mask for the plan signs: the colourist's red wash inside a walled town.
fn townWash(uv: vec2<f32>, kind: u32, pxPerUnit: f32) -> f32 {
  let base = kind & 15u;
  if (base == SIGN_CITY_PLAN) {
    return signCov(signPlanRim(uv), pxPerUnit);
  }
  if (base == SIGN_FORTRESS) {
    return signCov(signStar(uv, 0.62, 5.0, 3.2), pxPerUnit);
  }
  return 0.0;
}
