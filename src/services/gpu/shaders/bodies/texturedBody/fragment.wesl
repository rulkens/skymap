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

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
@group(0) @binding(3) var ringTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

// The antique Moon pass's crater rings (`packMoonPrint.ts`): picked per frame on the
// CPU (`pickMoonCraters`), largest first, so the last ring holding a pixel is its smallest.
struct MoonCrater {
  c: vec3<f32>,
  rho: f32,
  weight: f32,
  cosReach: f32,
  _p0: f32,
  _p1: f32,
};
struct MoonPrint {
  count: u32,
  unit: f32,
  focalPx: f32,
  _p0: f32,
  craters: array<MoonCrater, 128>,
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

// ── The antique Moon (`moon-print` pass, the look's `antique-relief` row) ─────
// r sqrt(linear luma) at a 1024-texel mip floor (the maria: below ~10 km the albedo
// is ejecta and small craters, not a mare's shape); g 1 + the relief ratio, 0 where
// no Moon; b rim ink; a 1 + the wall coordinate inside a big crater's wall band.

const MARE_MIP_TEXELS: f32 = 1024.0;
// Mips over the hardware LOD: relief read at the hatching's scale, not the pixel's.
const RELIEF_BIAS: f32 = 1.5;
// The normal-map bake's slopes are ~0.4 of LOLA's (gain 8 over an 8-bit height).
const SLOPE_GAIN: f32 = 2.4;
// Mirror ANTIQUE_MOON_RIM_UNITS (layers/body/spheres/data/antiqueMoonPrint.ts).
const RIM_MIN_UNITS: f32 = 20.0;
const RIM_FULL_UNITS: f32 = 32.0;
// A crater this wide takes concentric wall hatching on 0.55 < psi/rho < 1.
const FRAME_MIN_UNITS: f32 = 48.0;
const WALL_Q: f32 = 0.55;
// Eight hatch lines at the plate's default spacing (ANTIQUE_TUNING_DEFAULTS.hatchUnits,
// 4.2): `rank8` needs only the line index mod 8.
const WALL_PERIOD: f32 = 33.6;

fn mareAlbedo(uv: vec2<f32>, ddx: vec2<f32>, ddy: vec2<f32>) -> f32 {
  let g = max(max(length(ddx), length(ddy)), 1e-9);
  let s = max(1.0, (1.0 / MARE_MIP_TEXELS) / g);
  let rgb = textureSampleGrad(bodyTexture, bodySampler, uv, ddx * s, ddy * s).rgb;
  return sqrt(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)));
}

// A slope's light over the flat ground's (a Lambert ratio), so walls read with the
// same contrast at any Sun height; near the terminator sunward slopes exceed 1.
fn reliefRatio(ng: vec3<f32>, nRelief: vec3<f32>, sun: vec3<f32>) -> f32 {
  let flat = dot(ng, sun);
  let lit = flat + SLOPE_GAIN * (dot(nRelief, sun) - flat);
  return clamp(lit / max(flat, 0.04), 0.0, 2.0);
}

// x the nearest rim's ink, y units in from the rim of the smallest crater whose wall
// band holds the point (-1 none). dNdx/dNdy: the geometric normal's screen derivatives.
// The inner wall on the Sun's side faces away from it: the shaded one, cut heavier.
fn craterRims(n: vec3<f32>, dNdx: vec3<f32>, dNdy: vec3<f32>, sun: vec3<f32>, unitsPerRad: f32,
              pxUnits: f32) -> vec2<f32> {
  var ink = 0.0;
  var wall = -1.0;
  var best = 1e9;
  let ndl = dot(n, sun);
  let lowSun = 1.0 - smoothstep(0.25, 0.75, ndl);
  let stv = sun - ndl * n;
  let st = stv * inverseSqrt(max(dot(stv, stv), 1e-12));
  // How far the Sun stands off the zenith: only a tilted Sun lights one wall.
  let tilt = smoothstep(0.2, 0.5, length(stv));
  for (var i = 0u; i < moon.count; i++) {
    let cr = moon.craters[i];
    let cosPsi = dot(n, cr.c);
    if (cosPsi < cr.cosReach) {
      continue;
    }
    let inv = cr.c - cosPsi * n;
    let sinPsi = sqrt(max(dot(inv, inv), 1e-12));
    let psi = atan2(sinPsi, cosPsi);
    let dUnits = 2.0 * cr.rho * unitsPerRad;
    // |grad psi| per px: d psi = -dot(c, dN) / sin psi.
    let gPx = length(vec2<f32>(dot(cr.c, dNdx), dot(cr.c, dNdy))) / sinPsi;
    let d = abs(psi - cr.rho) / max(gPx, 1e-9) * pxUnits;
    let shadeSide = -dot(inv / sinPsi, st);
    let w = cr.weight * smoothstep(RIM_MIN_UNITS, RIM_FULL_UNITS, dUnits);
    if (d < best && w > 0.01) {
      best = d;
      // The burin by weight (1.0 fine, 1.6 fresh), swelling on the shaded side; at a
      // low Sun the lit side is one fine cut.
      var width = select(1.0, 1.6, cr.weight > 0.75) + 1.4 * smoothstep(0.0, 0.8, shadeSide) * lowSun * w;
      width = 1.0 + (width - 1.0) * (1.0 - lowSun * (1.0 - smoothstep(-0.3, 0.5, shadeSide)));
      // A small crater under a tilted Sun is its shadow crescent: the lit rim is paper,
      // as the period plates left it; a big one keeps its ring for the wall arcs.
      let crescent = tilt * (1.0 - smoothstep(FRAME_MIN_UNITS, 1.5 * FRAME_MIN_UNITS, dUnits));
      let litGap = crescent * (1.0 - smoothstep(-0.55, -0.2, shadeSide));
      ink = inkLine(d, width, pxUnits) * smoothstep(0.05, 0.25, w) * (1.0 - litGap);
    }
    let q = psi / cr.rho;
    if (q < 1.0 && q > WALL_Q && dUnits >= FRAME_MIN_UNITS && cr.weight > 0.3 && ndl > 0.0) {
      wall = (1.0 - q) * cr.rho * unitsPerRad;
    }
  }
  return vec2<f32>(ink, wall);
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
  let rims = craterRims(ng, dNdx, dNdy, sun, unitsPerRad, pxUnits);
  let day = smoothstep(-0.02, 0.06, dot(ng, sun));
  let wall = select(0.0, 1.0 + WALL_PERIOD * fract(rims.y / WALL_PERIOD), rims.y >= 0.0);
  return vec4<f32>(mareAlbedo(uv, grad.ddx, grad.ddy), 1.0 + reliefRatio(ng, nRelief, sun), rims.x * day, wall);
}
