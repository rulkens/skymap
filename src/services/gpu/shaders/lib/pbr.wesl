// lib/pbr.wesl — the shared physically-based (microfacet) shading core the
// lit bodies compose. Earth's surface fragment is the first consumer (the
// ocean glint drives the whole design); the Moon and Mars reuse it later,
// which is why it lives here rather than inline in Earth's fragment.
//
// ## The microfacet decomposition
//
// A real surface reflects light two ways at once, and this module sums them:
//
//   outgoing_radiance = (diffuse * albedo + specular) * NoL
//
//   - DIFFUSE — light that refracts into the material, scatters, and re-emerges
//     in a random direction. Modelled here with Oren-Nayar (see below), which
//     degrades gracefully to ideal Lambert. Tinted by the surface 'albedo'.
//   - SPECULAR — light that reflects off the microscopic facets of the surface
//     without entering it. Modelled with the Cook-Torrance microfacet BRDF
//     'D * G * F / (4 * NoV * NoL)'. For a dielectric this lobe is nearly
//     white (see the F0 note), so it is a scalar here, not albedo-tinted.
//
// Both terms are true BRDF values (units of 1/steradian): the diffuse carries
// its '1 / PI' and the specular carries its '1 / (4 NoV NoL)', so the two are on
// the SAME normalisation and their relative balance is physically meaningful —
// a smoother surface trades diffuse spread for a tighter, brighter highlight
// without a hand-tuned fudge between them. 'pbrDirect' then weights the sum by
// the incidence cosine 'NoL' (Lambert's cosine law) and returns the outgoing
// radiance for a unit-radiance sun.
//
// ## What this module deliberately does NOT do
//
//   - No AMBIENT. 'pbrDirect' is the DIRECT (sun-lit) term only; the caller adds
//     the shared 'AMBIENT' floor from 'lib/bodyLighting.wesl' separately, and
//     scales this result by the body's 'sunIrradiance'. Keeping ambient out of
//     here means the one ambient constant stays the single source of truth (the
//     same discipline 'bodyLighting.wesl' documents), and the night hemisphere's
//     lift is decided in one place for every body.
//   - No metalness, no image-based lighting (IBL), no multi-scatter energy
//     compensation. Skymap's bodies are dielectrics (rock, water, ice) lit by a
//     single analytic sun, so 'f0' is a scalar dielectric reflectance (the
//     Fresnel value at normal incidence, ~0.02 for water, ~0.04 for rock — the
//     2-4% of light a non-metal reflects straight back). A full metalness
//     workflow would make 'f0' an RGB derived from a metallic mask; we have no
//     metals, so a scalar is the honest representation and costs nothing to read.
//   - No energy-conserving diffuse/specular coupling (the 'kD = 1 - F' factor).
//     The composition is the literal 'diffuse * albedo + specular' the Earth
//     fragment expects. For a dielectric F0 the double-count at normal incidence
//     is ~2-4% (invisible); the grazing-angle Fresnel behaviour that WOULD matter
//     for a rim-lit ocean is left as a later (plan B+) refinement so this stays a
//     small, predictable primitive.
//
// ## Roughness convention — perceptual vs linear
//
// Every function takes 'roughness' as the PERCEPTUAL roughness in [0, 1] (the
// value an artist / tuner sets). The GGX maths runs on the LINEAR roughness
// 'alpha = roughness * roughness' (the Disney/UE remap), which spreads the
// visually-useful range more evenly across the slider. Each function applies the
// square itself, so callers always pass perceptual roughness and never
// pre-square.
//
// ## Numerical guards
//
//   - 'MIN_ROUGHNESS' floors the roughness inside 'distributionGGX' so 'alpha'
//     can never reach 0 — at alpha = 0 the GGX denominator collapses to a Dirac
//     spike (a divide-by-zero for any facet off the mirror direction). The floor
//     keeps a perfectly smooth request (roughness = 0, e.g. an airless body that
//     only wants Lambert diffuse) from detonating the specular term.
//   - The Cook-Torrance '4 * NoV * NoL' denominator is the one genuine
//     divide-by-zero site (both cosines vanish at the grazing silhouette).
//     'pbrDirect' clamps it from below. The numerator (D * G * F) also vanishes
//     there — G carries an 'NoV * NoL' factor — so the clamp only tames the 0/0,
//     and any residual is annihilated by the outer 'NoL' cosine weight anyway.
//
// Comments single-quoted, never backticks (the WESL parser tokenises a backtick
// even inside a comment). This module is GPU code and is verified VISUALLY via
// the Task 8 Earth fragment (the ocean glint), not by a unit test.

import package::lib::math::PI;

// ── tunable constants ────────────────────────────────────────────────
//
// Two knobs, eye-calibrated against the Earth ocean glint in the Task 8
// fragment (via HMR). They live here, next to the BRDF that reads them, so the
// Moon/Mars reuse and the Earth surface can never drift a value apart.

// GGX singularity floor (perceptual roughness). Below this the specular lobe is
// so tight it would alias to a single blown-out pixel and 'alpha' would approach
// the divide-by-zero in 'distributionGGX'. Smooth-water sits above it.
const MIN_ROUGHNESS: f32 = 0.02;

// Smooth open-water roughness — low enough that the sun's reflection stays a
// tight, bright specular glint rather than a broad sheen. The starting point for
// Task 8's tuning; the ocean is the reason this whole module exists.
const OCEAN_ROUGHNESS: f32 = 0.06;

// ── distributionGGX (D) — Trowbridge-Reitz normal distribution ───────
//
// The fraction of microfacets whose normal points along the half-vector 'h'
// (the direction that mirrors the view into the light). This is what gives a
// glossy highlight its shape: a sharp bright core that falls off with the
// facet-slope statistics.
//
//   D(h) = alpha^2 / (PI * ((NoH^2 * (alpha^2 - 1) + 1))^2)
//
// with 'alpha = roughness^2'. Derivation: GGX/Trowbridge-Reitz assumes the
// microfacet slopes follow a distribution with long tails (which is why GGX
// highlights have the characteristic soft outer glow real materials show, unlike
// the abrupt cutoff of Beckmann). Smaller alpha concentrates the facets near the
// surface normal, giving a smaller, brighter peak: at NoH = 1 the denominator is
// PI * alpha^4, so the peak height is 1 / (PI * alpha^2) — which is exactly why
// alpha must be floored away from 0. The '1 / PI' keeps D a normalised
// distribution (it integrates to 1 over the hemisphere, weighted by NoH), so the
// specular term is a true BRDF and balances the diffuse '1 / PI'.
//
// 'NoH' is the caller's already-clamped 'max(dot(n, h), 0)'.

fn distributionGGX(NoH: f32, roughness: f32) -> f32 {
  let a = max(roughness, MIN_ROUGHNESS);
  let alpha = a * a;
  let alpha2 = alpha * alpha;
  // With alpha in (0, 1], (alpha2 - 1) <= 0, so d = 1 - NoH^2 * (1 - alpha2) is
  // bounded below by alpha2 > 0 (its minimum, reached at NoH = 1). The floor on
  // 'a' is what keeps that lower bound off zero.
  let d = NoH * NoH * (alpha2 - 1.0) + 1.0;
  return alpha2 / (PI * d * d);
}

// ── geometrySmithGGX (G) — Smith masking-shadowing ───────────────────
//
// The fraction of the mirror-facing microfacets that are neither hidden from the
// light (shadowing) nor from the camera (masking) by neighbouring bumps. Without
// it, rough surfaces would appear to gain energy at grazing angles.
//
// This uses the SEPARABLE Smith form with Schlick's GGX approximation and Karis'
// direct-light remap — 'G = G1(NoV) * G1(NoL)', where
//
//   G1(x) = x / (x * (1 - k) + k),   k = (roughness + 1)^2 / 8
//
// Two choices, both deliberate:
//
//   - Separable (masking and shadowing treated as independent) over
//     height-correlated Smith. Height-correlated is marginally more accurate at
//     grazing angles, BUT it does not factor into a per-direction G1 — its
//     natural output is the combined VISIBILITY 'G2 / (4 NoV NoL)', which would
//     need a SECOND internal divide-by-zero guard. The separable form's G1
//     denominator is bounded below by 'k >= 1/8 > 0' for any roughness in
//     [0, 1], so this function has NO internal singularity: the ONLY guarded
//     divide in the whole module is the Cook-Torrance '4 NoV NoL' in 'pbrDirect',
//     exactly as the contract states. For a plausible ocean glint the accuracy
//     gap is invisible; the simpler guard story wins.
//   - Karis' 'k = (roughness + 1)^2 / 8' (the ANALYTIC-light remap) rather than
//     the IBL remap 'k = alpha / 2'. Our sun is a single analytic directional
//     light, and this remap is the one Karis tuned to keep such lights from
//     over-brightening rough surfaces. Note it reads the perceptual roughness
//     directly, NOT 'alpha' — mixing the 'alpha = roughness^2' remap in D with
//     this 'k' remap in G is the standard, validated pairing (per Karis 2013 /
//     the canonical LearnOpenGL formulation), not an inconsistency.
//
// 'NoV' and 'NoL' are the caller's already-clamped cosines.

fn geometrySmithGGX(NoV: f32, NoL: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  let gv = NoV / (NoV * (1.0 - k) + k);
  let gl = NoL / (NoL * (1.0 - k) + k);
  return gv * gl;
}

// ── fresnelSchlick (F) — Schlick's Fresnel approximation ─────────────
//
// The fraction of light reflected (rather than refracted) as a function of the
// angle between the incident ray and the microfacet normal. Reflectance rises
// from 'f0' at normal incidence to 1.0 at the grazing limit — the reason every
// surface, even matte, turns mirror-like when viewed edge-on.
//
//   F(cosTheta) = f0 + (1 - f0) * (1 - cosTheta)^5
//
// Schlick's polynomial approximates the full Fresnel equations to within a
// percent or so across the whole angular range while costing five multiplies
// instead of a pair of transcendental refraction terms. 'f0' is the scalar
// dielectric reflectance at normal incidence (see the module header).
//
// 'cosTheta' is expected to be 'VoH' (view dotted with the half-vector), the
// angle at the microfacet — 'pbrDirect' supplies it. The '(1 - cosTheta)' is
// clamped to [0, 1] so a slightly-negative cosine from interpolation can never
// feed a negative base into the odd power. '(1-cosTheta)^5' is expanded as
// 'm*m * m*m * m' to avoid a 'pow' call.

fn fresnelSchlick(cosTheta: f32, f0: f32) -> f32 {
  let m = clamp(1.0 - cosTheta, 0.0, 1.0);
  let m2 = m * m;
  return f0 + (1.0 - f0) * (m2 * m2 * m);
}

// ── orenNayarDiffuse — rough-surface diffuse ─────────────────────────
//
// Lambert assumes a surface is a perfect uniform diffuser. Real rough surfaces
// (soil, dry rock, the Moon's regolith) are microscopically faceted: at grazing
// illumination the facets shadow and mask one another such that the surface
// stays FLATTER in brightness than Lambert predicts — the full Moon looks like a
// flat disc, not a shaded ball, which Lambert cannot reproduce. Oren-Nayar
// captures that retro-reflective flattening with two roughness-dependent terms.
//
// This returns the diffuse BRDF value PER UNIT albedo (units of 1/steradian);
// 'pbrDirect' multiplies by 'albedo' and by the incidence cosine 'NoL'. At
// 'roughness = 0' it collapses to '1 / PI' — ideal Lambert — so an airless body
// that only wants Lambert diffuse pays nothing extra by routing through here
// (spec section 5).
//
//   f_d = (1 / PI) * (A + B * max(0, cos(dPhi)) * sin(alpha) * tan(beta))
//   A = 1 - 0.5 * s2 / (s2 + 0.33)          (s2 = roughness^2, the slope variance)
//   B = 0.45 * s2 / (s2 + 0.09)
//   alpha = max(thetaI, thetaR),  beta = min(thetaI, thetaR)
//
// This is evaluated in the trig-free closed form (no acos / sin / tan, which are
// both costly and singular at grazing where 'tan(beta)' diverges). Two identities
// collapse the geometric term to dot products:
//
//   - cos(dPhi) * sin(thetaI) * sin(thetaR) = dot(l - n*NoL, v - n*NoV)
//                                           = dot(l, v) - NoL*NoV  ('s' below).
//     The 'max(0, .)' on cos(dPhi) becomes 'max(0, s)'.
//   - sin(alpha) * tan(beta) = sin(thetaI) * sin(thetaR) / cos(beta)
//                            = sin(thetaI) * sin(thetaR) / max(NoL, NoV),
//     since {alpha, beta} = {thetaI, thetaR} as a set (so the sine product is
//     symmetric) and cos(beta) = cos(min angle) = max(NoL, NoV).
//
// Dividing the first by the sine product leaves 'max(0, s) / max(NoL, NoV)'. The
// denominator is floored: it vanishes only when both cosines do (the unlit
// grazing silhouette), where the outer 'NoL' weight in 'pbrDirect' zeroes the
// contribution regardless.

fn orenNayarDiffuse(n: vec3<f32>, v: vec3<f32>, l: vec3<f32>, roughness: f32) -> f32 {
  let NoL = max(dot(n, l), 0.0);
  let NoV = max(dot(n, v), 0.0);
  let s2 = roughness * roughness;
  let A = 1.0 - 0.5 * s2 / (s2 + 0.33);
  let B = 0.45 * s2 / (s2 + 0.09);
  // s = cos(dPhi) * sin(thetaI) * sin(thetaR); negative means the projected view
  // and light diverge past 90 deg in azimuth, where Oren-Nayar's retro term is 0.
  let s = dot(l, v) - NoL * NoV;
  let azimuth = B * max(s, 0.0) / max(max(NoL, NoV), 1e-4);
  return (A + azimuth) / PI;
}

// ── pbrDirect — the composed direct-lighting term ────────────────────
//
// Assembles the microfacet BRDF for a single analytic sun and returns the
// outgoing radiance toward the camera for a UNIT-radiance sun. The caller scales
// by the body's 'sunIrradiance' and adds the shared 'AMBIENT' floor
// ('lib/bodyLighting.wesl') afterward — this function is the direct term ONLY.
//
// All vectors are UNIT and in the SAME frame (the body's local frame, matching
// 'litShade' in 'lib/bodyLighting.wesl'):
//   n — surface normal.  v — surface -> camera.  l — surface -> sun.
// 'albedo' is the linear-RGB surface colour, 'roughness' the perceptual
// roughness in [0, 1], 'f0' the scalar dielectric normal-incidence reflectance.
//
//   half   = normalize(v + l)               (the mirror bisector)
//   spec   = D(NoH) * G(NoV,NoL) * F(VoH) / (4 * NoV * NoL)
//   diff   = orenNayarDiffuse(...) * albedo
//   return (diff + spec) * NoL
//
// The cosines are clamped to 0 so a normal facing away from the view or the sun
// contributes nothing (and never feeds a negative value into D/G/F). The '4 NoV
// NoL' divide is floored — the module's single guarded singularity; see the
// header. Roughness is passed through unclamped: 'distributionGGX' applies the
// 'MIN_ROUGHNESS' floor itself (the only term with a singularity), while
// Oren-Nayar deliberately sees the true roughness so 'roughness = 0' yields exact
// Lambert diffuse alongside a floored-tight specular — the airless-body case.

fn pbrDirect(
  n: vec3<f32>,
  v: vec3<f32>,
  l: vec3<f32>,
  albedo: vec3<f32>,
  roughness: f32,
  f0: f32,
) -> vec3<f32> {
  let h = normalize(v + l);
  let NoL = max(dot(n, l), 0.0);
  let NoV = max(dot(n, v), 0.0);
  let NoH = max(dot(n, h), 0.0);
  let VoH = max(dot(v, h), 0.0);

  let D = distributionGGX(NoH, roughness);
  let G = geometrySmithGGX(NoV, NoL, roughness);
  let F = fresnelSchlick(VoH, f0);
  let specular = (D * G * F) / max(4.0 * NoV * NoL, 1e-4);

  let diffuse = orenNayarDiffuse(n, v, l, roughness) * albedo;

  return (diffuse + vec3<f32>(specular)) * NoL;
}
