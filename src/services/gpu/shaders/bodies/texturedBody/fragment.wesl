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
import package::antiqueLook::engraving::inkLine;
import package::lib::util::hash21Hq;
import package::antiqueLook::bodies::moonRow::encodeMoonRow;
import package::antiqueLook::groundNoise::groundNoiseAt;

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
  _p1: f32,
};
struct MoonPrint {
  count: u32,
  unit: f32,
  focalPx: f32,
  radiusM: f32,
  craters: array<MoonCrater, 60>,
};
@group(1) @binding(0) var<uniform> moon: MoonPrint;

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
// g 1 where the body covers.
@fragment
fn fsAlbedoMask(in: TexturedBodyVSOut) -> @location(0) vec4<f32> {
  let rd = normalize(in.localPos - u.camPosLocal);
  let surface = hitUnitSphere(u.camPosLocal, rd, u.camAltitudeSq);
  let uv = equirectUvFromDir(surface.point);
  let grad = equirectUvGradients(uv);
  if (!surface.hit) {
    discard;
  }
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
// Linear albedo over which a crater's floor is no sea (the plate's MARE_SHORE).
const BRIGHT_FLOOR: f32 = 0.25;
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

// A rayed crater's ejecta (weight over 1: Copernicus, Keplerus, Aristarchus) brightens the
// ground it fell on for ~300 km, which then reads as highland: the row takes the ground
// round it, the two darkest of 8 taps on each of three circles 4, 6 and 8 radii out (the
// dark between and beyond the rays), fading out over BLANKET radii, where the shore follows
// the albedo, so a crater thrown on a sea sits in that sea. x that ground (sqrt luma), y
// its reach 0..1.
const BLANKET = vec2<f32>(2.5, 7.0);
// The taps' mip: the albedo over ~40 km.
const BLANKET_TEXELS: f32 = 256.0;

fn blanketGround(n: vec3<f32>) -> vec2<f32> {
  var ground = 1.0;
  var reach = 0.0;
  let lod = log2(f32(textureDimensions(bodyTexture).x) / BLANKET_TEXELS);
  for (var i = 0u; i < moon.count; i++) {
    let cr = moon.craters[i];
    let cosPsi = dot(n, cr.c);
    let here = 1.0 - smoothstep(BLANKET.x, BLANKET.y, acos(clamp(cosPsi, -1.0, 1.0)) / cr.rho);
    if (cr.weight < 1.05 || here <= 0.0) {
      continue;
    }
    let e1 = normalize(cross(vec3<f32>(0.0, 0.0, 1.0), cr.c));
    let e2 = cross(cr.c, e1);
    var d0 = 1.0;
    var d1 = 1.0;
    for (var k = 0; k < 24; k++) {
      let a = f32(4 + 2 * (k / 8)) * cr.rho;
      let t = f32(k) * 0.7853982 + f32(k / 8) * 0.39;
      let p = cr.c * cos(a) + (e1 * cos(t) + e2 * sin(t)) * sin(a);
      let rgb = textureSampleLevel(bodyTexture, bodySampler, equirectUvFromDir(p), lod).rgb;
      let s = sqrt(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)));
      d1 = min(d1, max(d0, s));
      d0 = min(d0, s);
    }
    ground = min(ground, 0.5 * (d0 + d1));
    reach = max(reach, here);
  }
  return vec2<f32>(ground, reach);
}

// x rim ink (the nearest live ring's line, every crescent), y inside a crater's floor
// (0..1). n the geometric normal, dNdx/dNdy its screen derivatives, rd the eye's ray.
fn craterRims(n: vec3<f32>, dNdx: vec3<f32>, dNdy: vec3<f32>, sun: vec3<f32>, rd: vec3<f32>,
              unitsPerRad: f32, pxUnits: f32) -> vec2<f32> {
  // The youngest ring holding the point inside 0.97 of its rim (1 - cos psi ~ psi² / 2).
  var youngest = -1.0;
  for (var i = 0u; i < moon.count; i++) {
    let cr = moon.craters[i];
    if (1.0 - dot(n, cr.c) < 0.47 * cr.rho * cr.rho) {
      youngest = max(youngest, craterYouth(cr));
    }
  }
  var ink = 0.0;
  var crescent = 0.0;
  var inFloor = 0.0;
  var best = 1e9;
  // The Sun as seen on the plate: its sides of a crater hold even at full Moon.
  let seen = sun - dot(sun, rd) * rd;
  for (var i = 0u; i < moon.count; i++) {
    let cr = moon.craters[i];
    let cosPsi = dot(n, cr.c);
    // A named crater's mark may outgrow its reach: it reaches ~100 km (cos 0.998) at least.
    if (cosPsi < select(cr.cosReach, min(cr.cosReach, 0.998), cr.named > 0.5) || craterYouth(cr) < youngest - 1e-3) {
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
  return vec2<f32>(max(ink, crescent), inFloor);
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
  let rims = craterRims(ng, dNdx, dNdy, sun, rd, unitsPerRad, pxUnits);
  let flat = dot(ng, sun);
  let lit = flat + SLOPE_GAIN * (dot(nRelief, sun) - flat);
  let day = smoothstep(-0.02, 0.06, lit);
  // A crater floor brighter than any sea keeps the plate's mare lines off it (b + 2).
  let fine = mareTap(uv, grad.ddx, grad.ddy, 1.0, MARE_MIP_TEXELS, MARE_CAP_KM);
  let blanket = blanketGround(ng);
  let albedo = mareAlbedo(uv, grad.ddx, grad.ddy);
  let wide = mareTap(uv, grad.ddx, grad.ddy, MARE_WIDE_PX, MARE_WIDE_TEXELS, MARE_WIDE_CAP_KM);
  // The blanket keeps the albedo's own swell over its ground, so the sea's lines still vary.
  let thrownOn = min(albedo, blanket.x + 0.6 * (albedo - wide));
  return encodeMoonRow(mix(albedo, thrownOn, blanket.y), lit, rims.x * day,
    rims.y > 0.5 && fine * fine > BRIGHT_FLOOR, mix(wide, min(wide, blanket.x), blanket.y));
}

// The Moon's ground in the shared relief row (`relief.wesl`'s contract), from the normal
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

// The nearest ring's psi / rho at n (small angles: psi ~ sqrt(2 (1 - cos psi))).
fn nearestRing(n: vec3<f32>) -> f32 {
  var q = 1e9;
  for (var i = 0u; i < moon.count; i++) {
    let cr = moon.craters[i];
    q = min(q, sqrt(max(2.0 * (1.0 - dot(n, cr.c)), 0.0)) / cr.rho);
  }
  return q;
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
  let q = nearestRing(ng);
  let onRing = q < RING_INNER || (q < RING_FLANK && slope > RELIEF_STEEP);
  let stroke = select(-RELIEF_FLAT, slope, slope > RELIEF_STROKE && onRing) * resolved * day;
  return vec4<f32>(fall, noise, stroke);
}
