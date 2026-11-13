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

fn signCov(d: f32, ppu: f32) -> f32 {
  return clamp(0.5 - d * ppu, 0.0, 1.0);
}

fn signStroke(d: f32, w: f32, ppu: f32) -> f32 {
  return signCov(abs(d) - 0.5 * w, ppu);
}

fn signBox(p: vec2<f32>, c: vec2<f32>, b: vec2<f32>) -> f32 {
  let q = abs(p - c) - b;
  return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);
}

fn signSegment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Isosceles triangle, apex at `apex`, pointing up, base `h` below with half-width `hw` (iq).
fn signSpire(p0: vec2<f32>, apex: vec2<f32>, hw: f32, h: f32) -> f32 {
  let q = vec2<f32>(hw, -h);
  var p = p0 - apex;
  p.x = abs(p.x);
  let a = p - q * clamp(dot(p, q) / dot(q, q), 0.0, 1.0);
  let b = p - q * vec2<f32>(clamp(p.x / q.x, 0.0, 1.0), 1.0);
  let s = -sign(q.y);
  let d = min(vec2<f32>(dot(a, a), s * (p.x * q.y - p.y * q.x)), vec2<f32>(dot(b, b), s * (p.y - q.y)));
  return -sqrt(d.x) * sign(d.y);
}

// Regular n-point star, one point up (iq's sdStar); m in [2, n], n means a plain polygon.
fn signStar(p0: vec2<f32>, r: f32, n: f32, m: f32) -> f32 {
  let an = SIGN_PI / n;
  let en = SIGN_PI / m;
  let acs = vec2<f32>(cos(an), sin(an));
  let ecs = vec2<f32>(cos(en), sin(en));
  let t = atan2(p0.x, p0.y);
  let bn = t - 2.0 * an * floor(t / (2.0 * an)) - an;
  var p = length(p0) * vec2<f32>(cos(bn), abs(sin(bn)));
  p = p - r * acs;
  p = p + ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
  return length(p) * sign(p.x);
}

// Parallel engraved lines along `dir`, spacing s; a flat tone of the same density when too fine.
fn signHatch(p: vec2<f32>, dir: vec2<f32>, s: f32, w: f32, ppu: f32) -> f32 {
  let dh = abs(fract(dot(p, dir) / s) - 0.5) * s;
  return mix(w / s, signCov(dh - 0.5 * w, ppu), smoothstep(1.8, 3.0, s * ppu));
}

// The walled town's rim: a circle toothed with eight small bastions.
fn signPlanRim(p: vec2<f32>) -> f32 {
  let k = 8.0;
  let t = atan2(p.x, p.y) * k / (2.0 * SIGN_PI);
  let tooth = 1.0 - 2.0 * abs(fract(t) - 0.5);
  return length(p) - (0.55 + 0.11 * tooth);
}

// A tower of half-width hw and height h standing on `foot`, its spire sh tall (SDF).
fn signTower(p: vec2<f32>, x: f32, foot: f32, hw: f32, h: f32, sh: f32) -> f32 {
  let body = signBox(p, vec2<f32>(x, foot + 0.5 * h), vec2<f32>(hw, 0.5 * h));
  return min(body, signSpire(p, vec2<f32>(x, foot + h + sh), hw + 0.03, sh));
}

// A gabled house in profile: walls h tall under a roof rh tall (SDF).
fn signHouse(p: vec2<f32>, x: f32, foot: f32, hw: f32, h: f32, rh: f32) -> f32 {
  let walls = signBox(p, vec2<f32>(x, foot + 0.5 * h), vec2<f32>(hw, 0.5 * h));
  return min(walls, signSpire(p, vec2<f32>(x, foot + h + rh), hw + 0.04, rh));
}

fn townSign(uv: vec2<f32>, kind: u32, pxPerUnit: f32) -> vec2<f32> {
  let ppu = pxPerUnit;
  let w = max(0.085, 0.85 / ppu);
  let hair = max(0.05, 0.6 / ppu);
  let base = kind & 15u;
  var ink = 0.0;
  var sil = 1e3;
  var top = 0.62;

  if (base == SIGN_CITY_PLAN) {
    let rim = signPlanRim(uv);
    let streets = max(signHatch(uv, vec2<f32>(0.8, 0.6), 0.2, hair, ppu),
                      signHatch(uv, vec2<f32>(-0.6, 0.8), 0.2, hair, ppu));
    ink = max(signStroke(rim, w, ppu), streets * signCov(rim + 0.06, ppu));
    sil = rim;
    top = 0.6;
  } else if (base == SIGN_FORTRESS) {
    let rampart = signStar(uv, 0.62, 5.0, 3.2);
    let glacis = rampart - 0.13;
    let core = length(uv) - 0.1;
    ink = max(max(signStroke(rampart, w, ppu), signStroke(glacis, hair, ppu)), signCov(core, ppu));
    sil = glacis;
    top = 0.6;
  } else if (base == SIGN_HAMLET) {
    let ring = length(uv) - 0.4;
    ink = max(signStroke(ring, w, ppu), signCov(length(uv) - 0.13, ppu));
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
      let q = vec2<f32>(abs(uv.x), uv.y);
      let keep = max(signBox(q, vec2<f32>(0.4, foot + 0.25), vec2<f32>(0.11, 0.25)),
                     -signBox(q, vec2<f32>(0.4, foot + 0.5), vec2<f32>(0.04, 0.06)));
      towers = min(signTower(uv, 0.0, foot, 0.12, 0.7, 0.38), keep);
      houses = signBox(uv, vec2<f32>(0.0, foot + 0.13), vec2<f32>(0.4, 0.13));
      ink = signCov(length(uv - vec2<f32>(0.0, -0.66)) - 0.06, ppu);
      top = 0.62;
    } else {
      towers = signTower(uv, 0.0, foot, 0.11, 0.66, 0.42);
      houses = min(signHouse(uv, -0.3, foot, 0.15, 0.26, 0.24), signHouse(uv, 0.3, foot, 0.15, 0.26, 0.24));
      top = 0.62;
    }
    var footSil = ground - 0.5 * w;
    if (base != SIGN_VILLAGE) {
      footSil = length(uv - vec2<f32>(0.0, -0.66)) - 0.16;
      ground = abs(footSil);
    }
    let group = min(towers, houses);
    let shade = signHatch(uv, vec2<f32>(1.0, 0.0), 0.12, hair, ppu) * signCov(towers, ppu);
    let lines = max(signStroke(group, w, ppu), signStroke(towers, w, ppu));
    ink = max(ink, max(max(lines, shade), signCov(ground - 0.5 * w, ppu)));
    sil = min(group, footSil);
  }

  let flags = kind & (SIGN_SEE_BISHOP | SIGN_SEE_ARCHBISHOP);
  if (flags != 0u) {
    let y1 = top + 0.34;
    var cross = signSegment(uv, vec2<f32>(0.0, top), vec2<f32>(0.0, y1));
    cross = min(cross, signSegment(uv, vec2<f32>(-0.1, y1 - 0.1), vec2<f32>(0.1, y1 - 0.1)));
    if ((flags & SIGN_SEE_ARCHBISHOP) != 0u) {
      cross = min(cross, signSegment(uv, vec2<f32>(-0.14, y1 - 0.2), vec2<f32>(0.14, y1 - 0.2)));
    }
    ink = max(ink, signCov(cross - 0.5 * w, ppu));
    sil = min(sil, cross - 0.5 * w);
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
