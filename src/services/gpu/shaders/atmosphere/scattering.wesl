// atmosphere/scattering.wesl — the Bruneton/Neyret (2008) + Hillaire (2020)
// scattering core the three LUT bakes and the shell fragment compose.
//
// Everything is passed, never captured: WESL has no global state, so a lib
// module cannot see a consumer's '@group/@binding'. That buys a property the
// renderer depends on — the LUT parametrisations below are built from RATIOS
// of radii, so they are UNIT-AGNOSTIC. The bakes feed km radii and the shell
// fragment feeds local (top == 1) radii, and the uv agrees, which is why the
// fragment needs neither the km radii nor 'ScatteringParams'.
//
// Comments single-quoted, NEVER backticks (the WESL parser tokenises a
// backtick even inside a comment). Verified VISUALLY, not by a unit test.

import package::lib::math::PI;
import package::lib::util::raySphere;

// The sphere centre for every ray-sphere test here: the planet centre, at the
// local origin in the frame these functions run in.
const ORIGIN = vec3<f32>(0.0, 0.0, 0.0);

// The isotropic phase — a photon scattered with equal probability into every
// direction on the sphere carries '1 / (4*PI)' of the incident radiance per
// steradian. Used for the multiple-scattering estimate (Hillaire treats higher
// orders as directionally uniform).
const UNIFORM_PHASE: f32 = 1.0 / (4.0 * PI);

// A small floor for the '(S - S*T) / extinction' analytic step integral, so a
// vanishing extinction (the near-vacuum top of the atmosphere) cannot divide by
// zero. Well below any real per-km coefficient.
const EXTINCTION_EPS: f32 = 1e-7;

// ── ScatteringParams ─────────────────────────────────────────────────
//
// The per-body constants the bakes integrate — the WESL twin of the TypeScript
// 'AtmosphereParams', written by 'utils/gpu/packScatteringParams.ts'. Keep the
// two in lockstep: a byte-layout drift raises no GPU error and iOS answers it
// with a dropped frame. Coefficients are 1/km and radii/heights are km, so the
// bakes march in km with no conversion.
//
// The roles are NOT positional. A constituent carries its own scatter and
// absorb vectors, its own density profile and its own phase function, so
// 'molecules', 'haze' and 'ozone' are rows in a list rather than three named
// struct members. The twilight knobs ride the per-frame 'SkyViewParams'
// (skyViewLut.wesl), not this construction-written buffer, so they stay
// live-tunable.

const PROFILE_EXPONENTIAL: u32 = 0u;
const PROFILE_TENT: u32 = 1u;
const PHASE_RAYLEIGH: u32 = 0u;
const PHASE_HENYEY_GREENSTEIN: u32 = 1u;

// 48 bytes, align 16 — so 'array<Constituent, 4>' gets a 48-byte stride, which
// WGSL's uniform address space requires to be a multiple of 16.
struct Constituent {
  scatter: vec3<f32>,
  phaseG: f32,
  absorb: vec3<f32>,
  scaleHeightKm: f32,
  centerKm: f32,
  widthKm: f32,
  profileKind: u32,
  phaseKind: u32,
};

// 224 bytes: a 32-byte header, then the array (which must start 16-aligned,
// hence the explicit pad at 24).
struct ScatteringParams {
  groundAlbedo: vec3<f32>,
  planetRadiusKm: f32,
  atmosphereTopKm: f32,
  constituentCount: u32,
  _pad: vec2<f32>,
  constituents: array<Constituent, 4>,
};

// ── MediumSample — the local optical properties at a point ───────────
//
// The per-step quantities every march needs, in 1/km, summed over the
// constituents present at this altitude. 'scatterPhased' weights each
// constituent by its OWN phase function, which is why the caller no longer
// applies phases by name; 'scatterTotal' is the unweighted sum the isotropic
// multiple-scattering estimate wants; 'extinction' drives 'exp(-extinction*dt)'
// across a step.
struct MediumSample {
  scatterPhased: vec3<f32>,
  scatterTotal: vec3<f32>,
  extinction: vec3<f32>,
};

// ── phase functions ──────────────────────────────────────────────────

// rayleighPhase — the molecular scattering phase, '3/(16*PI) * (1 + cos^2)'.
// Gently forward-and-back symmetric; it is the reason a clear daytime sky is
// brightest near the sun AND near the anti-solar point, and blue overhead.
// 'cosTheta' is the cosine of the angle between the view ray and the sun.
fn rayleighPhase(cosTheta: f32) -> f32 {
  return (3.0 / (16.0 * PI)) * (1.0 + cosTheta * cosTheta);
}

// miePhase — the aerosol scattering phase, Henyey-Greenstein with asymmetry
// 'g' (Earth ~ 0.8, strongly forward). HG is the classic cheap single-lobe
// approximation:
//
//   p(cos) = (1 - g^2) / (4*PI * (1 + g^2 - 2*g*cos)^1.5)
//
// The strong forward peak (large g) is what produces the bright white glare
// ringing the sun and the silver lining on haze. 'cosTheta' as above; 'g' in
// (-1, 1). The denominator base '1 + g^2 - 2*g*cos' stays positive for any g in
// that range, so no guard is needed.
fn miePhase(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * PI * pow(max(denom, 0.0), 1.5));
}

// ── density profiles ─────────────────────────────────────────────────

// densityExponential — falloff normalised to 1 at the ground, for a well-mixed
// constituent. 'altitudeKm' is height above the ground sphere; the scale height
// is the e-folding distance (Earth's molecules ~8 km, its aerosol ~1.2 km).
fn densityExponential(altitudeKm: f32, scaleHeightKm: f32) -> f32 {
  return exp(-altitudeKm / scaleHeightKm);
}

// densityTent — a symmetric tent: 1 at the centre altitude, ramping linearly to
// 0 at 'centerKm +/- widthKm', clamped to 0 outside. The standard cheap
// stand-in for a discrete layer's bell (Hillaire uses it for ozone).
// Keep the zero-width branch: without it the tent divides by zero at EVERY
// sample (NaN at altitude 0, which the accumulator floors every ground-level
// sample to; +Inf above it), and WGSL's Finite Math Assumption then makes the
// whole expression an INDETERMINATE value, naming 'max' as a function that
// misbehaves under exactly that optimisation. The outer clamp is not a guard.
fn densityTent(altitudeKm: f32, centerKm: f32, widthKm: f32) -> f32 {
  if (widthKm <= 0.0) {
    return 0.0;
  }
  return max(0.0, 1.0 - abs(altitudeKm - centerKm) / widthKm);
}

fn constituentDensity(c: Constituent, altitudeKm: f32) -> f32 {
  if (c.profileKind == PROFILE_TENT) {
    return densityTent(altitudeKm, c.centerKm, c.widthKm);
  }
  return densityExponential(altitudeKm, c.scaleHeightKm);
}

fn constituentPhase(c: Constituent, cosTheta: f32) -> f32 {
  if (c.phaseKind == PHASE_HENYEY_GREENSTEIN) {
    return miePhase(cosTheta, c.phaseG);
  }
  return rayleighPhase(cosTheta);
}

// accumulateMedium — the optical properties at 'posKm' (a position in km,
// planet centre at the origin), summed over the body's constituents. Altitude
// is floored at 0 so a point a hair below the ground sphere (numerical) does
// not blow the density past ground level.
//
// The accumulator starts at zero and adds in list order, which is what makes
// this arithmetically identical to the three named terms it replaced.
fn accumulateMedium(
  params: ScatteringParams,
  posKm: vec3<f32>,
  cosTheta: f32,
  phased: bool,
) -> MediumSample {
  let altitude = max(0.0, length(posKm) - params.planetRadiusKm);

  var m: MediumSample;
  m.scatterPhased = vec3<f32>(0.0);
  m.scatterTotal = vec3<f32>(0.0);
  m.extinction = vec3<f32>(0.0);

  var i: u32 = 0u;
  loop {
    if (i >= params.constituentCount) { break; }
    let c = params.constituents[i];
    let d = constituentDensity(c, altitude);
    let s = c.scatter * d;
    m.scatterTotal = m.scatterTotal + s;
    m.extinction = m.extinction + (c.scatter + c.absorb) * d;
    if (phased) {
      m.scatterPhased = m.scatterPhased + s * constituentPhase(c, cosTheta);
    }
    i = i + 1u;
  }
  return m;
}

// sampleMedium — with the phase-weighted single-scatter source. 'cosTheta' is
// the cosine between the view ray and the sun.
fn sampleMedium(params: ScatteringParams, posKm: vec3<f32>, cosTheta: f32) -> MediumSample {
  return accumulateMedium(params, posKm, cosTheta, true);
}

// sampleMediumIsotropic — the same without it, for the transmittance bake
// (extinction only) and the multi-scatter bake (higher orders are treated as
// directionally uniform, so a phase weighting would be computed then discarded).
fn sampleMediumIsotropic(params: ScatteringParams, posKm: vec3<f32>) -> MediumSample {
  return accumulateMedium(params, posKm, 0.0, false);
}

// ── ray geometry ─────────────────────────────────────────────────────

// distanceToTop — the distance from a point at radius 'r' (planet centre at the
// origin) with view-zenith cosine 'mu' to the top-of-atmosphere sphere, along
// the view ray. Reuses the shared 'raySphere' quadratic; the point is inside
// the top sphere (r < top), so the two roots straddle 0 and the FAR (positive)
// root is the exit distance. 'mu = dot(dir, up)' where up is the outward
// radial. The ray is placed on the +z axis (azimuth is irrelevant for a
// distance, by spherical symmetry).
fn distanceToTop(r: f32, mu: f32, topRadius: f32) -> f32 {
  let p = vec3<f32>(0.0, 0.0, r);
  let dir = vec3<f32>(sqrt(max(0.0, 1.0 - mu * mu)), 0.0, mu);
  let roots = raySphere(p, dir, ORIGIN, topRadius);
  return max(0.0, roots.y);
}

// rayHitsGround — does the view ray from radius 'r' with zenith cosine 'mu'
// strike the ground sphere ahead of the origin? True only for down-looking rays
// whose near ground root is positive. Drives the march-boundary choice (a ray
// that hits the ground stops there; the surface occludes the far atmosphere).
fn rayHitsGround(r: f32, mu: f32, bottomRadius: f32) -> bool {
  let p = vec3<f32>(0.0, 0.0, r);
  let dir = vec3<f32>(sqrt(max(0.0, 1.0 - mu * mu)), 0.0, mu);
  let roots = raySphere(p, dir, ORIGIN, bottomRadius);
  return roots.x > 0.0;
}

// marchDistance — the length of the march from 'p0' along unit 'dir': to the
// first ground hit if the ray strikes the ground ahead, otherwise to the
// top-of-atmosphere exit. General (arbitrary azimuth), for the multi-scatter
// and sky-view bakes whose rays are not axis-aligned. The same clamp shape as
// the CPU 'atmosphereShellBound' (top far root; ground-hit far clamp).
fn marchDistance(p0: vec3<f32>, dir: vec3<f32>, bottomRadius: f32, topRadius: f32) -> f32 {
  let top = raySphere(p0, dir, ORIGIN, topRadius);
  var tMax = max(0.0, top.y);
  let ground = raySphere(p0, dir, ORIGIN, bottomRadius);
  if (ground.x > 0.0) {
    tMax = min(tMax, ground.x);
  }
  return tMax;
}

// ── transmittance LUT parametrisation (Bruneton/Hillaire) ────────────
//
// The transmittance LUT stores, per texel, the rgb transmittance from a point
// (radius r, view-zenith cosine mu) to the top of atmosphere. The (r, mu) <->
// uv mapping is Bruneton's, which concentrates resolution near the horizon
// (where transmittance changes fastest). It is built entirely from radii
// ratios, hence unit-agnostic (see the module header): pass km radii in the
// bake, local (top == 1) radii in the fragment; the uv is identical.
//
//   H   = sqrt(top^2 - bottom^2)          — the horizon-grazing chord length
//   rho = sqrt(r^2 - bottom^2)            — the ground-tangent distance at r
//   d   = distance to the top along (r, mu)
//   uv.x = (d - d_min) / (d_max - d_min),  d_min = top - r,  d_max = rho + H
//   uv.y = rho / H

// transmittanceLutParamsToUv — (r, mu) -> uv. The consumer side (bake integrand
// endpoints, multi-scatter/sky-view sun lookups, the fragment's segment ratio).
fn transmittanceLutParamsToUv(bottomRadius: f32, topRadius: f32, r: f32, mu: f32) -> vec2<f32> {
  let H = sqrt(max(0.0, topRadius * topRadius - bottomRadius * bottomRadius));
  let rho = sqrt(max(0.0, r * r - bottomRadius * bottomRadius));
  // Distance to the top boundary along (r, mu): far root of the top sphere.
  let discriminant = r * r * (mu * mu - 1.0) + topRadius * topRadius;
  let d = max(0.0, -r * mu + sqrt(max(0.0, discriminant)));
  let dMin = topRadius - r;
  let dMax = rho + H;
  let xMu = (d - dMin) / max(1e-6, dMax - dMin);
  let xR = rho / max(1e-6, H);
  return vec2<f32>(xMu, xR);
}

// transmittanceLutUvToParams — uv -> (r, mu). The bake side: given a texel's uv,
// recover the (r, mu) whose transmittance this texel stores. Returns
// vec2(r, mu).
fn transmittanceLutUvToParams(bottomRadius: f32, topRadius: f32, uv: vec2<f32>) -> vec2<f32> {
  let H = sqrt(max(0.0, topRadius * topRadius - bottomRadius * bottomRadius));
  let rho = H * uv.y;
  let r = sqrt(max(0.0, rho * rho + bottomRadius * bottomRadius));
  let dMin = topRadius - r;
  let dMax = rho + H;
  let d = dMin + uv.x * (dMax - dMin);
  var mu = 1.0;
  if (d > 0.0) {
    mu = (H * H - rho * rho - d * d) / (2.0 * r * d);
  }
  return vec2<f32>(r, clamp(mu, -1.0, 1.0));
}

// sampleTransmittanceToTop — the rgb transmittance from (r, mu) to the top of
// atmosphere, read from the baked LUT. Passes the texture + sampler explicitly
// (the 'lib/flow.wesl' pattern). 'textureSampleLevel' at LOD 0 — required in a
// compute stage (no implicit derivatives) and correct in the fragment too.
fn sampleTransmittanceToTop(
  lut: texture_2d<f32>,
  samp: sampler,
  bottomRadius: f32,
  topRadius: f32,
  r: f32,
  mu: f32,
) -> vec3<f32> {
  let uv = transmittanceLutParamsToUv(bottomRadius, topRadius, r, mu);
  return textureSampleLevel(lut, samp, uv, 0.0).rgb;
}

// ── multi-scatter LUT parametrisation ────────────────────────────────
//
// The multi-scatter LUT is view-INDEPENDENT: it stores the isotropic
// multiple-scattering contribution at (sun-zenith cosine, altitude). The uv is
// a plain linear mapping — this LUT is low-frequency, so no horizon warp is
// needed. Unit-agnostic (altitude fraction is a ratio).

// multiScatterLutParamsToUv — (sunCosZenith, r) -> uv.
fn multiScatterLutParamsToUv(bottomRadius: f32, topRadius: f32, r: f32, sunCosZenith: f32) -> vec2<f32> {
  let x = sunCosZenith * 0.5 + 0.5;
  let y = (r - bottomRadius) / max(1e-6, topRadius - bottomRadius);
  return clamp(vec2<f32>(x, y), vec2<f32>(0.0), vec2<f32>(1.0));
}

// sampleMultiScatter — the isotropic multiple-scattering estimate at (r,
// sunCosZenith), read from the baked LUT. The sky-view bake adds this to the
// single-scatter source at every march step; the shell fragment never samples
// it directly (the sky-view LUT already folds it in).
fn sampleMultiScatter(
  lut: texture_2d<f32>,
  samp: sampler,
  bottomRadius: f32,
  topRadius: f32,
  r: f32,
  sunCosZenith: f32,
) -> vec3<f32> {
  let uv = multiScatterLutParamsToUv(bottomRadius, topRadius, r, sunCosZenith);
  return textureSampleLevel(lut, samp, uv, 0.0).rgb;
}

// ── sky-view LUT parametrisation (Hillaire) ──────────────────────────
//
// The sky-view LUT is view-DEPENDENT and rebaked per frame at the camera's
// current altitude. Its texel is (view-zenith, azimuth-relative-to-sun). The
// zenith axis uses Hillaire's horizon-split sqrt warp: the lower half of the
// texture (uv.y < 0.5) covers ABOVE the horizon, the upper half BELOW it, each
// with a sqrt distribution that packs resolution against the horizon line where
// the sky gradient (and the sunset band) is sharpest. The azimuth axis is a
// sqrt-warped cosine of the view-to-sun angle. All ratios of radii, hence
// unit-agnostic: the bake feeds km radii, the fragment feeds local (top == 1).
//
// 'lightViewCosAngle' is cos of the azimuthal angle between the view ray and
// the sun, both projected off the up axis; it is what makes the LUT symmetric
// about the sun and lets the fragment index it from any camera orientation.

// skyViewLutParamsToUv — (viewZenithCos, lightViewCos) -> uv, the fragment side.
// 'intersectsGround' picks the above/below-horizon half.
fn skyViewLutParamsToUv(
  bottomRadius: f32,
  viewHeight: f32,
  viewZenithCos: f32,
  lightViewCos: f32,
  intersectsGround: bool,
) -> vec2<f32> {
  let vHorizon = sqrt(max(0.0, viewHeight * viewHeight - bottomRadius * bottomRadius));
  let cosBeta = vHorizon / max(1e-6, viewHeight);
  let beta = acos(clamp(cosBeta, -1.0, 1.0));
  let zenithHorizonAngle = PI - beta;

  var uvY: f32;
  if (!intersectsGround) {
    var coord = acos(clamp(viewZenithCos, -1.0, 1.0)) / max(1e-6, zenithHorizonAngle);
    coord = 1.0 - coord;
    coord = sqrt(max(0.0, coord));
    coord = 1.0 - coord;
    uvY = coord * 0.5;
  } else {
    var coord = (acos(clamp(viewZenithCos, -1.0, 1.0)) - zenithHorizonAngle) / max(1e-6, beta);
    coord = sqrt(max(0.0, coord));
    uvY = coord * 0.5 + 0.5;
  }

  var uvX = sqrt(max(0.0, -lightViewCos * 0.5 + 0.5));
  return vec2<f32>(uvX, uvY);
}

// skyViewLutUvToParams — uv -> (viewZenithCos, lightViewCos), the bake side.
// Inverts the horizon-split sqrt warp above. Returns vec2(viewZenithCos,
// lightViewCos).
fn skyViewLutUvToParams(bottomRadius: f32, viewHeight: f32, uv: vec2<f32>) -> vec2<f32> {
  let vHorizon = sqrt(max(0.0, viewHeight * viewHeight - bottomRadius * bottomRadius));
  let cosBeta = vHorizon / max(1e-6, viewHeight);
  let beta = acos(clamp(cosBeta, -1.0, 1.0));
  let zenithHorizonAngle = PI - beta;

  var viewZenithCos: f32;
  if (uv.y < 0.5) {
    var coord = 2.0 * uv.y;
    coord = 1.0 - coord;
    coord = coord * coord;
    coord = 1.0 - coord;
    viewZenithCos = cos(zenithHorizonAngle * coord);
  } else {
    var coord = uv.y * 2.0 - 1.0;
    coord = coord * coord;
    viewZenithCos = cos(zenithHorizonAngle + beta * coord);
  }

  let coordX = uv.x * uv.x;
  let lightViewCos = -(coordX * 2.0 - 1.0);
  return vec2<f32>(viewZenithCos, lightViewCos);
}
