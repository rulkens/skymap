// texturedBody/fragment.wesl — fragment stage for a textured planet or moon:
// the lit albedo, the normal-mapped relief, Saturn's ring shadow and the
// Minnaert limb term, over a RAY-TRACED sphere.
//
// The rasterised triangles belong to a circumscribing proxy shell, not to the
// body. Every fragment casts a ray from the camera through its own proxy
// position, intersects the analytic unit sphere, and derives the surface point,
// the normal, the uv and the depth from that hit -- so the silhouette is a
// pixel-exact circle rather than a 48-gon, and the normal is exact rather than a
// barycentric blend.
//
// The sphere maths itself lives in 'lib/analyticSphere.wesl' -- the hit and its
// grazing fallback, the equirectangular uv convention, the wrap-safe gradient
// pair, and why the depth carries no reversed-Z flip are all explained there.
// This module supplies the ray and the shading.
//
// ## The ray, and why the direction is normalized AFTER interpolation
//
// 'u.camPosLocal' is the camera in the body's local frame in body radii (the
// same vector the Minnaert term already needs), so it is the ray origin with no
// extra uniform. 'in.localPos' is the interpolated point on the PROXY shell --
// scaled up by 'PROXY_SCALE', so it is NOT a unit vector and its interpolant is
// not unit length either. 'normalize' has to run on the DIFFERENCE, per
// fragment, after interpolation; skipping it silently breaks every dot product
// downstream (the house 'renormalize after a scaled model transform' trap).
//
// ## Oblateness is free -- because it is baked into the model matrix
//
// 'composeBodyMvp' folds a body's flattening into a non-uniform model Z scale,
// so in the LOCAL frame this shader works in, every body is the unit sphere.
// Ray-vs-unit-sphere therefore serves an oblate body with no ellipsoid maths,
// provided the ray ORIGIN lands in that same frame -- which is what
// 'camPosLocal's oblateness parameter is for. Every textured body passes
// oblateness 0 today (only scene STARS carry it), so the correction is inert
// here and load-bearing for the sphere pick.
//
// ## Where the derivatives are taken
//
// 'dpdx'/'dpdy' need UNIFORM control flow, so the uv gradients are taken before
// the 'discard' and the missed lanes ride along until then on the lib's grazing
// fallback. Both texture reads (surface + normal map) share the one corrected
// gradient pair, since both sample the same uv.

import package::bodies::texturedBody::io::TexturedBodyVSOut;
import package::lib::analyticSphere::equirectUvFromDir;
import package::lib::analyticSphere::equirectUvGradients;
import package::lib::analyticSphere::fragDepthFromClip;
import package::lib::analyticSphere::hitUnitSphere;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::bodyLighting::litShade;
import package::lib::limbDarkening::limbDarkening;
import package::lib::normalMap::perturbNormal;
import package::antiqueLook::shared::engraving::inkLine;
import package::lib::util::hash21Hq;
import package::antiqueLook::bodies::moonRow::encodeMoonRow;
import package::antiqueLook::shared::groundNoise::groundNoiseAt;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
@group(0) @binding(3) var ringTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

// The antique Moon's crater rings (`packMoonPrint.ts`), read by both Moon passes: picked
// per frame on the CPU (`pickMoonCraters`), largest first.
struct MoonCrater {
  c: vec3<f32>,
  rho: f32,
  weight: f32,
  cosReach: f32,
  // 1 for a crater the look names: ringed at full weight under the size cut.
  named: f32,
  // 1 for a rayed crater thrown on a sea (its blanket, `craterRims`).
  onSea: f32,
};
struct MoonPrint {
  count: u32,
  unit: f32,
  focalPx: f32,
  radiusM: f32,
  tilePx: vec2<f32>,
  _p0: vec2<f32>,
  craters: array<MoonCrater, 60>,
  // Two u32 of ring mask per tile (`binMoonCraters`), two tiles a vec4.
  tiles: array<vec4<u32>, 72>,
};
@group(1) @binding(0) var<uniform> moon: MoonPrint;
// Mirror ANTIQUE_MOON_TILES (layers/body/spheres/data/antiqueMoonPrint.ts).
const TILES = vec2<i32>(16, 9);

// The rings that can reach the tile holding frag (device px), as a mask over their order.
fn ringsAt(frag: vec2<f32>) -> vec2<u32> {
  let t = clamp(vec2<i32>(frag / moon.tilePx), vec2<i32>(0), TILES - 1);
  let k = t.y * TILES.x + t.x;
  let v = moon.tiles[k / 2];
  return select(v.xy, v.zw, (k & 1) == 1);
}

// The lowest ring left in the mask, which it clears.
fn popRing(mask: ptr<function, vec2<u32>>) -> u32 {
  if ((*mask).x != 0u) {
    let b = firstTrailingBit((*mask).x);
    (*mask).x &= ~(1u << b);
    return b;
  }
  let b = firstTrailingBit((*mask).y);
  (*mask).y &= ~(1u << b);
  return 32u + b;
}

// Colour + analytic depth. No '@builtin(position)' anywhere in this struct --
// the entry point's position comes in through 'TexturedBodyVSOut', and a second
// position-bearing struct in one linked module is rejected at
// 'createShaderModule' having passed both the build and the WESL linker.
struct FSOut {
  @location(0) colour: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

// The ring-on-planet half of the ring system: how much of the sun a point on
// this body still sees through Saturn's rings. Its twin -- the planet's shadow
// cast onto the ring -- lives in 'ring/fragment.wesl'. Local rather than in a
// lib because it is the only copy and the ring pair's two halves share no maths.
fn ringSunVisibility(p: vec3<f32>, sunDir: vec3<f32>, innerRatio: f32, outerRatio: f32) -> f32 {
  if (outerRatio <= 0.0) {
    return 1.0;
  }
  if (sunDir.z == 0.0) {
    return 1.0;
  }
  let t = -p.z / sunDir.z;
  if (t <= 0.0) {
    return 1.0;
  }
  let hit = p + t * sunDir;
  let r = length(hit.xy);
  if (r < innerRatio || r > outerRatio) {
    return 1.0;
  }
  let uCoord = (r - innerRatio) / (outerRatio - innerRatio);
  let ringAlpha = textureSampleLevel(ringTexture, bodySampler, vec2<f32>(uCoord, 0.5), 0.0).a;
  return 1.0 - ringAlpha;
}

// Half-width of the albedo mask's lightness ramp, linear luma: wide enough that
// an engraver's tone can follow the albedo, not just its one contour.
const ALBEDO_BAND: f32 = 0.06;

// The antique look's albedo map (`body-albedo-mask` pass, 'rg8unorm'), the twin of
// Earth's `fsOceanMask`: r lightness, 0 well below `u.albedoMid`, 1 well above;
// g 1 wherever the proxy covers. A ray past the sphere reads its horizon point, so
// terrain standing above that horizon up close keeps a lightness (the look's reduce
// counts only body pixels, so the sky's share is never read).
@fragment
fn fsAlbedoMask(in: TexturedBodyVSOut) -> @location(0) vec4<f32> {
  let rd = normalize(in.localPos - u.camPosLocal);
  let surface = hitUnitSphere(u.camPosLocal, rd, u.camAltitudeSq);
  let uv = equirectUvFromDir(surface.point);
  let grad = equirectUvGradients(uv);
  let albedo = textureSampleGrad(bodyTexture, bodySampler, uv, grad.ddx, grad.ddy).rgb;
  let luma = dot(albedo, vec3<f32>(0.2126, 0.7152, 0.0722));
  return vec4<f32>(smoothstep(u.albedoMid - ALBEDO_BAND, u.albedoMid + ALBEDO_BAND, luma), 1.0, 0.0, 1.0);
}

@fragment
fn fs(in: TexturedBodyVSOut) -> FSOut {
  // ── The ray ───────────────────────────────────────────────────────────────
  let ro = u.camPosLocal;
  // Renormalize AFTER interpolation: 'in.localPos' rides the 'PROXY_SCALE'-scaled
  // proxy, so neither it nor its interpolant is unit length.
  let rd = normalize(in.localPos - ro);

  // 'u.camAltitudeSq' is f64-derived -- see 'lib/analyticSphere.wesl's depth section.
  let surface = hitUnitSphere(ro, rd, u.camAltitudeSq);
  // Unit length in both branches, so it is the exact geometric normal.
  let ng = surface.point;

  // ── Analytic equirectangular uv + wrap-corrected gradients ────────────────
  let uv = equirectUvFromDir(ng);
  let grad = equirectUvGradients(uv);

  // Every derivative is now taken; from here the missed lanes contribute
  // nothing, so this is the first legal place to drop them.
  if (!surface.hit) {
    discard;
  }

  // ── Shading ───────────────────────────────────────────────────────────────
  let T = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), ng));
  let n = perturbNormal(ng, T, textureSampleGrad(normalTexture, bodySampler, uv, grad.ddx, grad.ddy).rg);
  let albedo = textureSampleGrad(bodyTexture, bodySampler, uv, grad.ddx, grad.ddy).rgb;
  let sunVis = ringSunVisibility(ng, u.sunDirLocal, u.ringInnerRatio, u.ringOuterRatio);
  let shade = litShade(n, u.sunDirLocal * sunVis);
  let noL = max(dot(n, u.sunDirLocal), 0.0);
  // 'ng - ro = rd * t' exactly, so 'v = -rd' -- no re-subtract, no renormalize.
  let v = -rd;
  let noV = max(dot(n, v), 0.0);
  let limb = limbDarkening(noL, noV, u.limbStrength, u.limbExponent);
  let colour = albedo * shade * limb;

  var out: FSOut;
  out.colour = vec4<f32>(colour, 1.0);
  // Eye-relative frame: the hit relative to the eye, through the
  // translation-free 'u.vpCamRelLocal' -- see 'lib/analyticSphere.wesl's depth
  // section.
  out.depth = fragDepthFromClip(u.vpCamRelLocal, rd * surface.t);
  return out;
}

// ── The antique Moon (`moon-print` into `antique-moon`, `moon-relief` into `antique-relief`)
// The Moon's row (`moonRow.wesl`): the albedo blurred over ~7 screen px, never finer than
// a 1024-texel mip (below ~10 km the albedo is ejecta, not a mare's shape); the terrain's
// light; rim ink and a bright floor; the albedo over ~24 px (never under ~170 km), the
// wide support the plate's mare threshold asks before a faint patch counts as sea.

const MARE_MIP_TEXELS: f32 = 1024.0;
// Screen footprints (px) of the mare's taps and of its wide support.
const MARE_BLUR_PX: f32 = 3.0;
const MARE_TAP_PX: f32 = 2.5;
const MARE_WIDE_PX: f32 = 24.0;
// The wide support never finer than ~170 km: a walled plain's dark floor (Clavius) is no sea.
const MARE_WIDE_TEXELS: f32 = 64.0;
// Mips over the hardware LOD: relief read at the hatching's scale, not the pixel's.
const RELIEF_BIAS: f32 = 1.0;
// The normal-map bake's slopes are ~0.4 of LOLA's (gain 8 over an 8-bit height).
const SLOPE_GAIN: f32 = 2.4;
// Mirror ANTIQUE_MOON_RIM_UNITS (layers/body/spheres/data/antiqueMoonPrint.ts).
const RIM_MIN_UNITS: f32 = 8.0;
const RIM_FULL_UNITS: f32 = 14.0;
const NAMED_MIN_UNITS: f32 = 7.0;
// Mirror ANTIQUE_MOON_NAMED_REACH_COS.
const NAMED_REACH_COS: f32 = 0.998;
// Linear albedo over which a crater's floor is no sea (the plate's MARE_SHORE), and under
// which a ringed floor is its own small sea (Plato, Grimaldi: Riccioli's dark ovals).
const BRIGHT_FLOOR: f32 = 0.25;
const DARK_FLOOR: f32 = 0.12;
// Arcs round a ruined wall: its rim breaks into about this many.
const RIM_ARCS: f32 = 9.0;

// A footprint's ground length (km) along a uv step: u spans the parallel, v half the meridian.
const MOON_CIRCUMFERENCE_KM: f32 = 10917.0;
// The blurs' ground caps (km): foreshortened at the limb and stretched toward the poles,
// a screen footprint averaged highland with sea into a false sea of faint lines.
const MARE_CAP_KM: f32 = 40.0;
const MARE_WIDE_CAP_KM: f32 = 300.0;

fn capOnGround(d: vec2<f32>, cosLat: f32, capKm: f32) -> vec2<f32> {
  let km = MOON_CIRCUMFERENCE_KM * length(vec2<f32>(d.x * cosLat, 0.5 * d.y));
  return d * min(1.0, capKm / max(km, 1e-6));
}

fn mareTap(uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>, footprintPx: f32, floorTexels: f32, capKm: f32) -> f32 {
  let g = max(max(length(ddx), length(ddy)), 1e-9);
  let s = max(footprintPx, (1.0 / floorTexels) / g);
  let cosLat = max(sin(3.14159265 * uv.y), 0.05);
  let rgb = textureSampleGrad(bodyTexture, bodySampler, uv, capOnGround(ddx * s, cosLat, capKm),
    capOnGround(ddy * s, cosLat, capKm)).rgb;
  return sqrt(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)));
}

fn mareAlbedo(uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> f32 {
  let cosLat = max(sin(3.14159265 * uv.y), 0.05);
  let ox = capOnGround(ddx * MARE_TAP_PX, cosLat, MARE_CAP_KM);
  let oy = capOnGround(ddy * MARE_TAP_PX, cosLat, MARE_CAP_KM);
  return (2.0 * mareTap(uv, ddx, ddy, MARE_BLUR_PX, MARE_MIP_TEXELS, MARE_CAP_KM) + mareTap(uv + ox, ddx, ddy, MARE_BLUR_PX, MARE_MIP_TEXELS, MARE_CAP_KM)
    + mareTap(uv - ox, ddx, ddy, MARE_BLUR_PX, MARE_MIP_TEXELS, MARE_CAP_KM) + mareTap(uv + oy, ddx, ddy, MARE_BLUR_PX, MARE_MIP_TEXELS, MARE_CAP_KM)
    + mareTap(uv - oy, ddx, ddy, MARE_BLUR_PX, MARE_MIP_TEXELS, MARE_CAP_KM)) / 6.0;
}

// A ring yields its line and crescent to a younger ring holding the point: a fresher one
// (curated weight a step heavier) or, as fresh, a smaller one, which lies on it.
fn craterYouth(cr: MoonCrater) -> f32 {
  return floor(cr.weight * 10.0 + 0.5) + 0.9 * (1.0 - min(cr.rho * 8.0, 1.0));
}

// The Sun-side inner wall's hachures, Riccioli's dark crescent: strokes down the wall from
// the rim, CRESCENT_PITCH units apart along it (a small ring at most CRESCENT_MAX_RAD, ~5),
// longest toward the Sun, none past ~70° off it, each tapering to a point. theta: the
// azimuth off the Sun, gTheta its rad per px; q: psi / rho.
const CRESCENT_PITCH: f32 = 4.2;
const CRESCENT_MAX_RAD: f32 = 0.42;
const CRESCENT_LEN: f32 = 0.42;
const CRESCENT_W: f32 = 1.9;

fn crescentInk(theta: f32, gTheta: f32, q: f32, rimUnits: f32, pxUnits: f32, seed: f32) -> f32 {
  let pitch = min(CRESCENT_PITCH / rimUnits, CRESCENT_MAX_RAD);
  let k = round(theta / pitch);
  let reach = CRESCENT_LEN * smoothstep(0.35, 0.95, cos(k * pitch)) * (0.75 + 0.5 * hash21Hq(vec2<f32>(k, seed)));
  let t = (1.0 - q) / max(reach, 1e-3);
  let w = CRESCENT_W * (1.0 - t);
  let d = abs(theta - k * pitch) / max(gTheta, 1e-9) * pxUnits;
  return inkLine(d, w, pxUnits) * step(0.5 * pxUnits, w) * step(-0.05, t);
}

// A rayed crater's ejecta brightens the ground it fell on for ~300 km, which then reads as
// highland: round a crater the look knows was thrown on a sea (`onSea`: Copernicus,
// Keplerus, Aristarchus) the row takes that sea's ground, MARE_GROUND, fading out over
// BLANKET radii, where the shore follows the albedo, so the crater sits in its sea.
const BLANKET = vec2<f32>(2.5, 7.0);
const MARE_GROUND: f32 = 0.34;

// A rayed crater's ejecta blanket (curated weight over 1), the ground it threw, as radial
// stipple (its rays have no honest data and stay dropped): dots in lanes EJECTA_PITCH units apart
// at the rim, fanning out with the radius, one every EJECTA_STEP units down a lane, drawn
// out along it (EJECTA_DOT half-length, half-width, units), kept densest within EJECTA.x
// radii and thinning to none at EJECTA.y. Mirror ANTIQUE_MOON_EJECTA.
const EJECTA = vec2<f32>(1.4, 2.4);
const EJECTA_PITCH: f32 = 3.2;
const EJECTA_STEP: f32 = 3.6;
const EJECTA_DOT = vec2<f32>(0.8, 0.55);
// A blanket prints round a crater whose radius spans EJECTA_UNITS (print units), dotted in
// fully by the second: a smaller one would wear a smudge, and its sea's lines run to its rim.
const EJECTA_UNITS = vec2<f32>(10.0, 20.0);
// Mirror MOON_PITCH (antiqueLook/bodies/moon.wesl): the mare lines' rows, print units.
const MARE_PITCH_UNITS: f32 = 4.6;

// n on the ground at q radii (> 1) from the crater; rhoUnits its radius in print units.
fn ejectaInk(n: vec3<f32>, cr: MoonCrater, q: f32, rhoUnits: f32, pxUnits: f32, seed: f32) -> f32 {
  // A frame fixed to the ground round the centre, so each dot keeps its place.
  let e1 = normalize(cross(cr.c, select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(cr.c.z) > 0.9)));
  let lanes = max(round(6.2831853 * rhoUnits / EJECTA_PITCH), 8.0);
  let a = (atan2(dot(n, cross(cr.c, e1)), dot(n, e1)) / 6.2831853 + 0.5) * lanes;
  let r = (q - 1.0) * rhoUnits / EJECTA_STEP;
  let cell = vec2<f32>(floor(a) % lanes, floor(r)) + seed;
  let h = vec3<f32>(hash21Hq(cell), hash21Hq(cell + 17.3), hash21Hq(cell + 41.7));
  let ac = floor(a) + 0.25 + 0.5 * h.x;
  let rc = floor(r) + 0.3 + 0.4 * h.y;
  let qc = 1.0 + rc * EJECTA_STEP / rhoUnits;
  let kept = step(h.z, 0.7 * (1.0 - smoothstep(EJECTA.x, EJECTA.y, qc)) * smoothstep(EJECTA_UNITS.x, EJECTA_UNITS.y, rhoUnits));
  let across = (a - ac) / lanes * 6.2831853 * q * rhoUnits;
  let along = (r - rc) * EJECTA_STEP;
  let size = mix(1.0, 0.65, smoothstep(1.0, EJECTA.y, qc));
  let d = length(vec2<f32>(along / EJECTA_DOT.x, across / EJECTA_DOT.y));
  let aa = 0.5 * pxUnits / EJECTA_DOT.y;
  return kept * (1.0 - smoothstep(size - aa, size + aa, d));
}

// x rim ink (the nearest live ring's line, every crescent, the ejecta's dots), y inside a
// crater's floor (0..1), z the reach of a sea crater's blanket (0..1), w 1 on a rayed
// crater's ejecta out to a ragged EJECTA.x .. EJECTA.y radii, where the mare lines stop.
// n the geometric normal, dNdx/dNdy its screen derivatives, rd the eye's ray.
fn craterRims(n: vec3<f32>, dNdx: vec3<f32>, dNdy: vec3<f32>, sun: vec3<f32>, rd: vec3<f32>,
              unitsPerRad: f32, pxUnits: f32, frag: vec2<f32>) -> vec4<f32> {
  let near = ringsAt(frag);
  // The youngest ring holding the point inside 0.97 of its rim (small angles: psi² ~
  // 2 (1 - cos psi)), and the blanket's reach.
  var youngest = -1.0;
  var blanket = 0.0;
  var ejecta = 0.0;
  var thrown = 0.0;
  var first = near;
  while (any(first != vec2<u32>(0u))) {
    let i = popRing(&first);
    let rho = moon.craters[i].rho;
    let psi2 = 2.0 * (1.0 - dot(n, moon.craters[i].c));
    if (psi2 < 0.94 * rho * rho) {
      youngest = max(youngest, craterYouth(moon.craters[i]));
    }
    if (moon.craters[i].onSea > 0.0 && psi2 < BLANKET.y * BLANKET.y * rho * rho) {
      blanket = max(blanket, 1.0 - smoothstep(BLANKET.x, BLANKET.y, sqrt(max(psi2, 0.0)) / rho));
    }
    if (moon.craters[i].weight > 1.0 && psi2 > rho * rho && psi2 < EJECTA.y * EJECTA.y * rho * rho
        && rho * unitsPerRad > EJECTA_UNITS.x) {
      let q = sqrt(psi2) / rho;
      ejecta = max(ejecta, ejectaInk(n, moon.craters[i], q, rho * unitsPerRad, pxUnits, f32(i) * 3.7));
      // Each mare line (its row as `moonMare` cuts them) stops at its own radius: a ragged edge.
      let edge = mix(EJECTA.x, EJECTA.y, 0.4 + 0.5 * hash21Hq(vec2<f32>(floor(frag.y / max(round(MARE_PITCH_UNITS / pxUnits), 3.0)), f32(i))));
      thrown = max(thrown, step(q, edge));
    }
  }
  var ink = 0.0;
  var crescent = 0.0;
  var inFloor = 0.0;
  var best = 1e9;
  // The Sun as seen on the plate: its sides of a crater hold even at full Moon.
  let seen = sun - dot(sun, rd) * rd;
  var second = near;
  while (any(second != vec2<u32>(0u))) {
    let i = popRing(&second);
    let cr = moon.craters[i];
    let cosPsi = dot(n, cr.c);
    // A named crater's mark may outgrow its reach: it reaches ~110 km at least.
    if (cosPsi < select(cr.cosReach, min(cr.cosReach, NAMED_REACH_COS), cr.named > 0.5) || craterYouth(cr) < youngest - 1e-3) {
      continue;
    }
    // From the centre toward the point, in the crater's tangent plane.
    let off = n - cosPsi * cr.c;
    let sinPsi = sqrt(max(dot(off, off), 1e-12));
    let psi = atan2(sinPsi, cosPsi);
    // A named crater too small to ring is drawn as its name's mark, NAMED_MIN_UNITS across.
    let rho = max(cr.rho, cr.named * 0.5 * NAMED_MIN_UNITS / unitsPerRad);
    let dUnits = 2.0 * rho * unitsPerRad;
    let w = max(cr.weight, 0.6 * cr.named) * max(smoothstep(RIM_MIN_UNITS, RIM_FULL_UNITS, dUnits), cr.named);
    let q = psi / rho;
    inFloor = max(inFloor, 1.0 - smoothstep(0.75, 0.85, q));
    // Azimuth off the seen Sun, and its rate per px (off's e1, e2 parts are n's).
    let sc = seen - dot(seen, cr.c) * cr.c;
    let scLen = length(sc);
    let e1 = sc / max(scLen, 1e-6);
    let e2 = cross(cr.c, e1);
    let x = dot(n, e1);
    let y = dot(n, e2);
    let theta = atan2(y, x);
    let gTheta = length(vec2<f32>(x * dot(e2, dNdx) - y * dot(e1, dNdx), x * dot(e2, dNdy) - y * dot(e1, dNdy)))
      / max(x * x + y * y, 1e-12);
    let sided = smoothstep(0.02, 0.1, scLen);
    // |grad psi| per px: d psi = -dot(c, dN) / sin psi.
    let gPx = length(vec2<f32>(dot(cr.c, dNdx), dot(cr.c, dNdy))) / sinPsi;
    let seed = f32(i) * 7.31 + rho * 1e4;
    crescent = max(crescent, crescentInk(theta, gTheta, q, rho / max(gPx, 1e-9) * pxUnits, pxUnits, seed) * sided
      * smoothstep(0.05, 0.25, w));
    let d = abs(psi - rho) / max(gPx, 1e-9) * pxUnits;
    if (d < best && w > 0.01) {
      best = d;
      // A fresh wall a firm cut, a rayed one (weight over 1) the plate's heaviest, a ruined
      // one fine and broken into arcs; every wall heavy on its shaded Sun side, fine on the
      // lit side, and broken there unless fresh.
      let side = mix(0.5, smoothstep(-0.5, 0.6, cos(theta)), sided);
      let width = (mix(0.9, 1.5, smoothstep(0.5, 0.85, cr.weight)) + 0.9 * smoothstep(1.0, 1.3, cr.weight))
        * mix(0.6, 1.4, side);
      let f = (theta / 6.2831853 + 0.5) * RIM_ARCS;
      let k = floor(f);
      let h0 = hash21Hq(vec2<f32>(k % RIM_ARCS, seed));
      let h1 = hash21Hq(vec2<f32>((k + 1.0) % RIM_ARCS, seed));
      let arc = mix(h0, h1, smoothstep(0.0, 1.0, fract(f)));
      let gap = min(0.7 * (1.0 - smoothstep(0.3, 0.7, cr.weight)) - 0.1
        + 0.45 * (1.0 - side) * (1.0 - smoothstep(0.9, 1.2, cr.weight)), 0.55);
      ink = inkLine(d, width, pxUnits) * smoothstep(0.05, 0.25, w) * smoothstep(gap - 0.06, gap + 0.06, arc);
    }
  }
  return vec4<f32>(max(max(ink, crescent), ejecta), inFloor, blanket, thrown);
}

@fragment
fn fsMoonPrint(in: TexturedBodyVSOut) -> @location(0) vec4<f32> {
  let rd = normalize(in.localPos - u.camPosLocal);
  let surface = hitUnitSphere(u.camPosLocal, rd, u.camAltitudeSq);
  let ng = surface.point;
  let uv = equirectUvFromDir(ng);
  let grad = equirectUvGradients(uv);
  let dNdx = dpdx(ng);
  let dNdy = dpdy(ng);
  if (!surface.hit) {
    discard;
  }
  let sun = u.sunDirLocal;
  let pxUnits = 1.0 / moon.unit;
  let unitsPerRad = moon.focalPx / surface.t * pxUnits;
  let T = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), ng));
  let b = exp2(RELIEF_BIAS);
  let nRelief = perturbNormal(ng, T, textureSampleGrad(normalTexture, bodySampler, uv, grad.ddx * b, grad.ddy * b).rg);
  let rims = craterRims(ng, dNdx, dNdy, sun, rd, unitsPerRad, pxUnits, in.clip.xy);
  let flat = dot(ng, sun);
  let lit = flat + SLOPE_GAIN * (dot(nRelief, sun) - flat);
  let day = smoothstep(-0.02, 0.06, lit);
  // A crater floor brighter than any sea keeps the plate's mare lines off it (b + 2).
  let fine = mareTap(uv, grad.ddx, grad.ddy, 1.0, MARE_MIP_TEXELS, MARE_CAP_KM);
  let blanket = rims.z;
  let albedo = mareAlbedo(uv, grad.ddx, grad.ddy);
  let wide = mareTap(uv, grad.ddx, grad.ddy, MARE_WIDE_PX, MARE_WIDE_TEXELS, MARE_WIDE_CAP_KM);
  // The blanket keeps the albedo's own swell over its ground, so the sea's lines still vary.
  let thrownOn = min(albedo, MARE_GROUND + 0.6 * (albedo - wide));
  // A dark floor passes the plate's wide support, which keeps a walled plain's floor paper.
  let support = select(wide, min(wide, fine), rims.y > 0.5 && fine * fine < DARK_FLOOR);
  return encodeMoonRow(mix(albedo, thrownOn, blanket), lit, rims.x * day,
    (rims.y > 0.5 && fine * fine > BRIGHT_FLOOR) || rims.w > 0.5, mix(support, min(support, MARE_GROUND), blanket));
}

// The Moon's ground in the shared relief row (`passes/reliefFragment.wesl`'s contract), from the normal
// map at SLOPE_GAIN: rg the screen fall line, b the ground noise, a a hachure's weight on
// a slope past RELIEF_SLOPE.x (both flanks of a rim, so the plate draws its crest), a hint
// of stipple weight on flats (ground, so a crest between flanks still prints), 0 by night
// and where a print unit spans more ground than RELIEF_M.y (the full disc). The hachures
// stay on the rings the plate draws: inside one (to RING_INNER of its radius) and on its
// outer flank out to RING_FLANK where steeper than RELIEF_STEEP; elsewhere flat, so no
// ringless hummock prints confetti and no wall's stroke crosses a rim as an eyelash.
const RELIEF_SLOPE = vec2<f32>(0.12, 0.45);
const RELIEF_STROKE: f32 = 0.35;
// The normal read this many times coarser than the pixel: a landform under ~8 px across
// (a small crater, a hummock) prints no hachure, which strewed confetti over a close-up.
const RELIEF_SCALE: f32 = 3.0;
const RELIEF_M = vec2<f32>(1200.0, 3000.0);
const RELIEF_FLAT: f32 = 0.01;
const RING_INNER: f32 = 0.97;
const RING_FLANK: f32 = 1.3;
const RELIEF_STEEP: f32 = 0.8;

// x inside a ring to RING_INNER of its radius, y within RING_FLANK of one (small angles:
// psi² ~ 2 (1 - cos psi)).
fn ringZone(n: vec3<f32>, frag: vec2<f32>) -> vec2<bool> {
  var inner = false;
  var flank = false;
  var near = ringsAt(frag);
  while (any(near != vec2<u32>(0u))) {
    let i = popRing(&near);
    let rho = moon.craters[i].rho;
    let psi2 = 2.0 * (1.0 - dot(n, moon.craters[i].c));
    inner = inner || psi2 < RING_INNER * RING_INNER * rho * rho;
    flank = flank || psi2 < RING_FLANK * RING_FLANK * rho * rho;
  }
  return vec2<bool>(inner, flank);
}

@fragment
fn fsMoonRelief(in: TexturedBodyVSOut) -> @location(0) vec4<f32> {
  let rd = normalize(in.localPos - u.camPosLocal);
  let surface = hitUnitSphere(u.camPosLocal, rd, u.camAltitudeSq);
  let ng = surface.point;
  let uv = equirectUvFromDir(ng);
  let grad = equirectUvGradients(uv);
  let dNdx = dpdx(ng);
  let dNdy = dpdy(ng);
  if (!surface.hit) {
    discard;
  }
  let metresPerUnit = surface.t * moon.radiusM * moon.unit / moon.focalPx;
  let resolved = smoothstep(RELIEF_M.y, RELIEF_M.x, metresPerUnit);
  if (resolved <= 0.0) {
    return vec4<f32>(0.0);
  }
  let T = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), ng));
  let n = perturbNormal(ng, T, textureSampleGrad(normalTexture, bodySampler, uv, grad.ddx * RELIEF_SCALE,
    grad.ddy * RELIEF_SCALE).rg);
  let up = dot(n, ng);
  // The normal leans downhill: its tangent part is the fall line on the ground.
  let downhill = (n - up * ng) * SLOPE_GAIN;
  let slope = smoothstep(RELIEF_SLOPE.x, RELIEF_SLOPE.y, atan2(length(downhill), up));
  // Onto the screen through the normal's own px derivatives (least squares in the plane).
  let gxx = dot(dNdx, dNdx);
  let gxy = dot(dNdx, dNdy);
  let gyy = dot(dNdy, dNdy);
  let rhs = vec2<f32>(dot(downhill, dNdx), dot(downhill, dNdy));
  let onScreen = vec2<f32>(gyy * rhs.x - gxy * rhs.y, gxx * rhs.y - gxy * rhs.x);
  let fall = select(vec2<f32>(0.0), onScreen / max(length(onScreen), 1e-12), length(downhill) > 1e-4);
  let noise = groundNoiseAt(ng * moon.radiusM, vec3<i32>(0), metresPerUnit);
  let flat = dot(ng, u.sunDirLocal);
  let day = smoothstep(-0.02, 0.06, flat + SLOPE_GAIN * (dot(n, u.sunDirLocal) - flat));
  let zone = ringZone(ng, in.clip.xy);
  let onRing = zone.x || (zone.y && slope > RELIEF_STEEP);
  let stroke = select(-RELIEF_FLAT, slope, slope > RELIEF_STROKE && onRing) * resolved * day;
  return vec4<f32>(fall, noise, stroke);
}
