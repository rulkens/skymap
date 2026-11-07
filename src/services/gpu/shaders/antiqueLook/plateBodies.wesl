// antiqueLook/plateBodies.wesl — the plate's analytic bodies: up to four of the
// frame's largest globes as spheres (and Saturn's ring as an annulus), ray-cast
// per pixel in world axes so the engraving knows N·L, the arc from the subsolar
// point, the ring radius and both shadows without a body-pass target.
// `packAntiquePlateBodies.ts` writes the record; its byte map is the struct below.

struct PlateBody {
  centre: vec4<f32>, // xyz eye→centre / radius (world); w apparent radius, print units
  sun: vec4<f32>, // xyz centre→Sun, unit; w its print convention, a PRINT_* code
  ring: vec4<f32>, // xyz the north pole (a ring's plane normal); w ring texture's outer edge (radii), 0 = no ring
  ringEdges: vec4<f32>, // C inner, B inner, Cassini mid, A outer (radii)
  spot: vec4<f32>, // xyz its one marked feature's centre, unit (Jupiter's Red Spot); w 1 = has one
}

struct PlateBodies {
  count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  items: array<PlateBody, 4>,
}

// Each body's own print convention, its module under `bodies/`; mirrored by
// ANTIQUE_BODY_PRINT_CODES (data/rendering/antiquePlateBodies.ts).
const PRINT_PLAIN: u32 = 0u;
const PRINT_EARTH: u32 = 1u;
const PRINT_MARS: u32 = 2u;
const PRINT_MOON: u32 = 3u;
const PRINT_JUPITER: u32 = 4u;

fn printOf(b: PlateBody) -> u32 {
  return u32(b.sun.w + 0.5);
}

// A body module's say over its pixels: the colour after its washes, and its own ink.
struct BodyPrint {
  col: vec3<f32>,
  ink: f32,
}

// Half-width of Saturn's Cassini division in its radii (2,295 km), the one ring
// with a division; its shadow on the ball lets light through there.
const CASSINI_HALF: f32 = 0.039;

struct BodyHit {
  t: f32, // ray distance in body radii; 1e30 = no hit
  ndl: f32,
  ndv: f32,
  theta: f32, // arc from the subsolar point, radians
  rho: f32, // ring-plane radius of the ray, radii (0 without a ring)
  onRing: bool,
  ballShadow: bool, // a ring point in the ball's shadow
  ringShadow: bool, // a ball point in the ring's shadow
  edgeUnits: f32, // screen distance to the ball's outline, print units; 1e30 where the ring hides it
  index: u32, // the record's slot, set by the caller that ranks the hits
}

// Where the ray meets the ball, the discriminant taken as r² − |m − b·rd|² (no
// cancellation far out). A miss is clamped to the closest approach, so the
// ball's coordinates continue smoothly past the limb (for one-sided gradients).
fn ballNormal(ray: vec3<f32>, c: vec3<f32>) -> vec3<f32> {
  let bc = dot(ray, c);
  let off = c - bc * ray;
  let t = bc - sqrt(max(1.0 - dot(off, off), 0.0));
  return normalize(t * ray - c);
}

fn subsolarArc(n: vec3<f32>, l: vec3<f32>) -> f32 {
  return atan2(length(cross(n, l)), dot(n, l));
}

fn ballTheta(ray: vec3<f32>, b: PlateBody) -> f32 {
  return subsolarArc(ballNormal(ray, b.centre.xyz), b.sun.xyz);
}

// Latitude, radians, of where the ray meets the ball (`ring.xyz` the pole).
fn ballLatitude(ray: vec3<f32>, b: PlateBody) -> f32 {
  return asin(clamp(dot(ballNormal(ray, b.centre.xyz), b.ring.xyz), -1.0, 1.0));
}

fn ringRho(ray: vec3<f32>, b: PlateBody) -> f32 {
  let c = b.centre.xyz;
  return length(dot(b.ring.xyz, c) / dot(ray, b.ring.xyz) * ray - c);
}

fn castPlateBody(ray: vec3<f32>, b: PlateBody) -> BodyHit {
  var h = BodyHit(1e30, 0.0, 0.0, 0.0, 0.0, false, false, false, 1e30, 0u);
  let c = b.centre.xyz;
  let l = b.sun.xyz;
  let e = b.ringEdges;
  let bc = dot(ray, c);
  let off = c - bc * ray;
  let disc = 1.0 - dot(off, off);
  let tBall = select(1e30, bc - sqrt(max(disc, 0.0)), disc > 0.0 && bc > 0.0);
  var tRing = 1e30;
  if (b.ring.w > 0.0) {
    let tr = dot(b.ring.xyz, c) / dot(ray, b.ring.xyz);
    h.rho = length(tr * ray - c);
    if (tr > 0.0 && h.rho > e.x && h.rho < b.ring.w) {
      tRing = tr;
    }
  }
  h.t = min(tBall, tRing);
  if (h.t >= 1e30) {
    return h;
  }
  // The C ring is gauze: over the ball, the ball's own tone shows through.
  let gauze = tRing < tBall && tBall < 1e29 && h.rho < e.y;
  h.onRing = tRing < tBall && !gauze;
  let n = ballNormal(ray, c);
  h.ndl = dot(n, l);
  h.ndv = -dot(n, ray);
  h.theta = subsolarArc(n, l);
  if (h.onRing) {
    let pr = tRing * ray - c;
    let pl = dot(pr, l);
    h.ballShadow = pl < 0.0 && length(pr - pl * l) < 1.0;
  } else if (b.ring.w > 0.0) {
    let tt = -dot(n, b.ring.xyz) / dot(l, b.ring.xyz);
    let r = length(n + tt * l);
    h.ringShadow = tt > 0.0 && r > e.x && r < e.w && abs(r - e.z) > CASSINI_HALF;
  }
  // The outline: angle off the silhouette cone, times units per radian
  // (R / tan(asin(1/d))). Hidden where the ring passes in front of it.
  let d = length(c);
  let fromAxis = atan2(length(cross(ray, c)), bc);
  h.edgeUnits = abs(fromAxis - asin(1.0 / d)) * b.centre.w * sqrt(max(d * d - 1.0, 0.0));
  if (h.onRing && tRing < bc) {
    h.edgeUnits = 1e30;
  }
  return h;
}
