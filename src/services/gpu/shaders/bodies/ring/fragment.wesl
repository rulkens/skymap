// ring/fragment.wesl -- fragment stage for the translucent planetary ring.
//
// Draws Saturn's rings as a two-sided scattering SLAB, textured by a radial
// alpha strip and dimmed where the planet's disc occults the sun (planet-on-ring
// shadow). This is the OTHER half of the ring system: 'texturedBody/fragment.wesl'
// casts the ring's shadow onto the planet; here the planet casts its shadow onto
// the ring.
//
// ## The geometry is a ring-agnostic disc; the hole is per-draw
//
// The ring mesh is a UNIT disc (annulus with inner radius 0), so ONE geometry
// serves any ring. The uniform 'innerRatio' (ring inner / ring outer) punches
// the hole per-draw: fragments inside it are discarded, and the visible band is
// normalized to the strip's [0, 1] u. This is why 'innerRatio' rides the uniform
// rather than being baked into the geometry or a per-vertex uv.
//
// ## Chandrasekhar single-scattering slab (not a Lambert sheet)
//
// A planetary ring is not a solid surface: it is a many-particle-thick layer of
// icy bodies with normal optical depth 'tau', and its photometry is the classic
// Chandrasekhar (1960) plane-parallel single-scattering slab -- the standard
// model of the Voyager/Cassini ring-photometry literature (Dones et al. 1993).
// With 'mu0 = |sun . z|' (solar elevation cosine off the ring plane), 'mu =
// |view . z|' (viewer elevation cosine), single-scattering albedo 'w0', and
// phase function 'P':
//
//   lit face (sun and viewer on the SAME side -- reflection):
//     I/F = (w0 P / 4) . mu0/(mu0 + mu) . (1 - exp(-tau (1/mu0 + 1/mu)))
//   unlit face (OPPOSITE sides -- diffuse transmission):
//     I/F = (w0 P / 4) . mu0/(mu0 - mu) . (exp(-tau/mu0) - exp(-tau/mu))
//     (limit (tau/mu) exp(-tau/mu) as mu -> mu0 -- guarded below)
//
// 'tau' derives from the strip's alpha, which stores the NORMAL-incidence
// opacity: 'tau = -ln(1 - alpha)'. The strip rgb carries the per-channel
// single-scattering albedo (scaled by 'W0_SCALE' -- the source strip bakes some
// shading in, and multiple scattering brightens the real B ring above its
// single-scatter value). 'P' is Henyey-Greenstein with NEGATIVE g: ring
// particles are strongly backscattering (brightest at opposition), the cheap
// stand-in for the literature's Callisto-type phase function.
//
// This replaces the old flat two-sided Lambert ('litShade' on the plane
// normal), which collapsed at grazing sun -- a real slab does not: the photon
// path through it lengthens like 1/mu0, so the (1 - exp(..)) term compensates,
// and the lit/unlit faces get genuinely different (reflection vs silhouetted
// transmission) appearances a sheet cannot express. Brightness now tracks the
// ring opening angle physically: wide-open epochs are bright, edge-on epochs
// dim (the sim's positions set the geometry -- no artistic floor).
//
// ## Planet-on-ring shadow (analytic, no shadow map)
//
// Does the planet's disc block the sun as seen from this ring point? Solve it in
// BODY-RADIUS units, where the planet is the UNIT sphere at the origin. The
// annulus point 'localPos' is authored at unit OUTER radius, so scaling by
// 1 / planetRadiusRatio (= ring outer / planet radius) rescales it into that
// frame, giving a ring point at radius > 1. Cast a ray toward the sun and test
// it against the unit sphere:
//
//   |p + t * sunDir|^2 = 1,  with sunDir a unit vector, so
//   t^2 + 2 (p.sunDir) t + (p.p - 1) = 0.
//
// Because the ring point is OUTSIDE the planet ('p.p' > 1), the two roots share a
// sign, and they are POSITIVE -- the ray meets the sphere on the way to the sun --
// exactly when the discriminant is non-negative AND 'p.sunDir < 0' (the ring
// point faces away from the sun). That single predicate IS 'the planet is between
// this point and the sun', so no explicit 't' is needed. In shadow the direct
// term drops to zero and only the small planet-shine ambient survives.
//
// ## Volumetric premultiplied compositing (the ring-over-dark-planet fix)
//
// A scattering slab composites EXACTLY as 'out = I + dst . exp(-tau/mu)': the
// slab's own scattered radiance 'I' does not depend on what is behind it, and
// the background only ADDS through the view transmittance. Emitting
// 'vec4(I, 1 - exp(-tau/mu))' under the pipeline's premultiplied OVER gives
// precisely that -- so a ring band in front of the (limb-darkened, dark) planet
// keeps its own brightness, and the dark disc can only add light through the
// gaps, never pull the band down. This is the principled form of the earlier
// 'albedo floor' -- no in-front-of-planet test needed. Note the view
// transmittance 'exp(-tau/mu)' is VIEW-DEPENDENT: a grazing view through the
// slab is more opaque than the face-on strip alpha, which the old constant
// 'strip.a' coverage could not express.
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float 'foreground:0' colour target with
// PREMULTIPLIED OVER blending (baked into the ring pipeline): 'src.rgb + dst*(1 -
// src.a)'. The strip is 'rgba8unorm-srgb', so the hardware linearises the colour
// on read -- correct for the HDR target.

import package::bodies::ring::io::VSOut;
import package::lib::sphere::RingUniforms;

// Scale from the strip's baked rgb to the per-channel single-scattering albedo
// 'w0'. The source strip bakes some shading into its colour (brightest band ~0.25
// linear vs the B ring's real w0 ~0.5+), and the isotropic multiple-scattering
// the single-scatter model omits brightens the thick bands further. Eye-tuned
// over HMR against the lit ring.
const W0_SCALE: f32 = 3.0;

// Henyey-Greenstein asymmetry for the ring particles. NEGATIVE = backscattering
// (brightest looking down-sun, the opposition geometry) -- the cheap single-lobe
// stand-in for the Callisto-type phase function the ring-photometry papers fit.
const PHASE_G: f32 = -0.35;

// Planet-shine ambient: the small fraction of light the ring receives from
// Saturn's lit globe, keeping the eclipse shadow band and the unlit face just
// off pure black (the slab twin of 'bodyLighting.wesl's AMBIENT floor).
const AMBIENT: f32 = 0.05;

// Elevation-cosine floor: keeps 1/mu and 1/mu0 finite at exactly edge-on
// geometry (where the real ring degenerates to a line anyway).
const MU_EPS: f32 = 1e-4;

// Alpha ceiling for the tau derivation: alpha -> 1 sends tau -> infinity;
// clamping at 0.995 caps tau ~ 5.3, already opaque for every practical mu.
const ALPHA_MAX: f32 = 0.995;

@group(0) @binding(0) var<uniform> u: RingUniforms;
@group(0) @binding(1) var ringSampler: sampler;
// The radial alpha strip -- an N x 1 'texture_2d' (never 'texture_1d': WebKit
// rejects the 1D sampler and silently drops the whole shared-encoder frame). A
// 1x1 transparent placeholder until the strip bitmap commits.
@group(0) @binding(2) var ringTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Normalized radius across the annulus. The disc geometry reaches r = 0, so
  // the uniform inner ratio remaps the visible band to [0, 1] and discards the
  // hole (r below the inner edge -- over the planet) and any r past the outer
  // edge (seam-interpolation guard).
  let r = length(in.localPos.xy);
  let radialU = (r - u.innerRatio) / (1.0 - u.innerRatio);
  if (radialU < 0.0 || radialU > 1.0) {
    discard;
  }

  // Sample the radial alpha strip. 'textureSampleLevel' (not 'textureSample'):
  // this call sits after the discard in non-uniform control flow, where the
  // implicit-LOD sampler's screen-space derivatives are undefined -- level 0 is
  // both legal there and correct for the mip-less strip. v = 0.5 reads the single
  // row's centre.
  let strip = textureSampleLevel(ringTexture, ringSampler, vec2<f32>(radialU, 0.5), 0.0);

  // Normal optical depth from the strip's face-on opacity, per-channel single-
  // scattering albedo from its colour (see the module header).
  let tau = -log(1.0 - min(strip.a, ALPHA_MAX));
  let w0 = strip.rgb * W0_SCALE;

  // Planet-on-ring shadow: rescale the ring point into body-radius units (planet
  // = unit sphere) and test the sun ray against it. See the module header for the
  // ray-sphere derivation and why the occlusion predicate needs no explicit t.
  let p = vec3<f32>(in.localPos.xy / u.planetRadiusRatio, 0.0);
  let h = dot(p, u.sunDirLocal);
  let disc = h * h - (dot(p, p) - 1.0);
  let occluded = disc >= 0.0 && h < 0.0;
  let sunVis = select(1.0, 0.0, occluded);

  // Slab geometry: elevation cosines of the sun and the viewer off the ring
  // plane (the local z axis), floored at MU_EPS for the edge-on degenerate. The
  // view ray runs camera -> fragment, both already in planet-radius units.
  let toFrag = p - u.camPosLocal;
  let viewDir = toFrag / length(toFrag);
  let mu0 = max(abs(u.sunDirLocal.z), MU_EPS);
  let mu = max(abs(viewDir.z), MU_EPS);

  // Henyey-Greenstein phase. cosTheta is between the photon's incoming
  // propagation (-sunDir) and its outgoing propagation toward the camera
  // (-viewDir) -- their dot is dot(sunDir, viewDir). Backscatter (g < 0) peaks
  // at cosTheta = -1: looking down-sun at a lit ring, the opposition geometry.
  let cosTheta = dot(u.sunDirLocal, viewDir);
  let g2 = PHASE_G * PHASE_G;
  let phase = (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * PHASE_G * cosTheta, 1e-4), 1.5);

  // Reflection vs transmission: same side of the ring plane -> the lit face
  // (reflection); opposite sides -> the unlit face (diffuse transmission).
  let sameSide = u.camPosLocal.z * u.sunDirLocal.z >= 0.0;
  var geom: f32;
  if (sameSide) {
    geom = (mu0 / (mu0 + mu)) * (1.0 - exp(-tau * (1.0 / mu0 + 1.0 / mu)));
  } else if (abs(mu0 - mu) < 1e-3) {
    // mu -> mu0 limit of the transmission bracket (L'Hopital): (tau/mu) e^(-tau/mu).
    geom = (tau / mu) * exp(-tau / mu);
  } else {
    geom = (mu0 / (mu0 - mu)) * (exp(-tau / mu0) - exp(-tau / mu));
  }

  // Scattered radiance: the direct single-scatter term (killed in the planet's
  // shadow) plus the small planet-shine ambient, scaled by the slab's view
  // coverage so empty gaps stay dark.
  let coverage = 1.0 - exp(-tau / mu);
  let scattered = w0 * (sunVis * (phase / 4.0) * geom + AMBIENT * coverage);

  // Volumetric premultiplied OVER: emit the slab's own radiance; the background
  // adds through the view transmittance (see the module header).
  return vec4<f32>(scattered, coverage);
}
