// License CC0: Spiral galaxy
// Ported to WGSL from the original ShaderToy GLSL (CC0) by mrange:
//   https://www.shadertoy.com/view/wsBBWD
//   Author profile: https://www.shadertoy.com/user/mrange
// See plan docs/superpowers/plans/2026-05-04-milky-way-impostor.md
// Task 0 for the verbatim original source and the WGSL-port deltas.
//
// ─────────────────────────────────────────────────────────────────────
//
// milkyWay/fragment.wesl — procedural Milky Way fragment stage.
//
// This file owns the heart of the impostor: the ray-marched
// procedural galaxy that gives the viewer a sense of being 'inside'
// the Milky Way.  All the procedural-galaxy helpers (stars, height,
// galaxyNormal, shadeGalaxyDisk, renderGalaxy, twirl, galaxy, mod2)
// live here too — they're fragment-only, called from nowhere else
// in the engine, so promoting them to lib/ would just add coupling
// without payoff. The decision is 'fragment-only helpers stay with
// the fragment file'.
//
// The vertex stage in 'milkyWay/vertex.wesl' provides world-space
// per-fragment positions; this file reconstructs the per-pixel
// world-space ray as 'normalize(worldPos - cameraPosWorld)' and feeds
// that ray (rotated into the galactic frame and scaled into the
// shader's local unit system) to the procedural raymarcher.
//
// ── Why output linear HDR colour?
//
// Every other pass in this engine writes linear-light into the rgba16f
// HDR target and the tone-map pass downstream applies the curve +
// exposure + (sRGB conversion via swap-chain format).  The original
// ShaderToy applied display-space gamma ('pow(col, 0.75)'), a contrast
// S-curve, a saturation pump, and a vignette in its 'postProcess'
// function — all of which are display-space operations that would
// double-up with the engine's tone-map pass and produce muddy crushed
// blacks.  Those four operations are DELETED, not ported.
//
// ── ShaderToy → WGSL specific notes
//
//   - GLSL 'inout' parameters in 'mod2(inout vec2 p, ...)' and
//     'rot(inout vec2 p, ...)' become value-returning helpers that
//     return the modified value (and a struct for 'mod2''s two-output
//     case).
//   - The two 'galaxy()' overloads (one taking '(vec2 p, float a,
//     float z)' for the noise hatching, one taking '(vec2 p, vec3 ro,
//     vec3 rd, float d)' for the full disk shading) collide in WGSL
//     which has no overloading.  We rename the four-arg overload to
//     'shadeGalaxyDisk' and keep the three-arg one as 'galaxy'.
//   - 'for (int i = 0; i < 11; ++i)' becomes 'for (var i: i32 = 0; i
//     < 11; i = i + 1)'.

import package::milkyWay::io::Uniforms;
import package::milkyWay::io::VsOut;
import package::lib::math::rot2;
import package::lib::math::sabs;
import package::lib::math::toPolar;
import package::lib::math::toRect;
// Orphan utilities — single-consumer helpers gathered in lib/util.wesl
// until a second renderer needs them. See that file's docblock for
// the rename rationale ('rand' → 'hash21' because it's a deterministic
// hash, not a PRNG; 'noise1' → 'valueNoise2' because the original was
// a numbered slot rather than a description).
import package::lib::util::hash21;
import package::lib::util::valueNoise2;
import package::lib::util::raySphere;
import package::lib::util::worldToGalactic;
import package::lib::util::galacticToShader;

// ── Bind-group declaration (matches vertex.wesl byte-for-byte) ──────
//
// WESL is module-local; we redeclare 'u' here using the Uniforms
// struct imported from milkyWay/io.wesl. The layout numbers and the
// underlying byte layout are identical to vertex.wesl's declaration
// because both files import the same authoritative struct definition.
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── Physical scale ──────────────────────────────────────────────────
//
// Milky Way disk D_25 ≈ 30 kpc.  MILKY_WAY_RADIUS_MPC is the
// world↔shader-unit ratio.  Inside the shader, the disk's exponential
// brightness falls off around l ≈ 0.7 (shader units) and the bulge
// ray-sphere has radius 0.125.  Multiplying those by this constant
// gives the world-space extent of those features.
//
// 0.030 ⇒ visible disk fades around l=0.7 × 30 kpc = 21 kpc radius
// (42 kpc diameter, matching the apparent body of M31 in the
// procedural pass).  Smaller values (e.g. 0.015) fade the disk well
// inside D_25 — visibly tiny next to peer spirals like M31, whose
// procedural-disk pass renders its body at ~D_25 ≈ 46 kpc.
//
// The companion MILKY_WAY_HALFEXTENT_MPC (lives in vertex.wesl) bounds
// the impostor billboard quad at 0.120 Mpc — 240 kpc total span,
// matching the 4× padding convention used by every other galaxy.
const MILKY_WAY_RADIUS_MPC: f32 = 0.030;

// ── Equatorial → galactic frame ─────────────────────────────────────
//
// 'worldToGalactic' and 'galacticToShader' (used to convert the
// world-space camera ray into the shader-local frame where the disk
// lies in y=0) live in lib/util.wesl alongside the J2000 rotation
// matrix constants. See that file for the derivation; the import at
// the top of this file keeps this section focused on the impostor's
// rendering logic.

// ── Volumetric raymarch tunables (bulge + disc halo) ────────────────
//
// Both extra contributions in 'renderGalaxy' (the central spherical
// bulge and the thin-disc halo that fills in the inter-arm regions)
// are short ray-marches of an analytical density profile.  Pulling
// the parameters into module-scope constants matches the convention
// used by 'proceduralDisks.wgsl' and makes the visual knobs easy to
// tweak without diving into the loop body.
//
// Sampling cost is fixed: BULGE_STEPS + DISC_HALO_STEPS exp() calls
// per fragment (32 with current values).  The impostor is one quad,
// so total per-frame cost stays in the low-millisecond range even
// at 4K.

// Bulge — Gaussian density centred at the world origin.
// SIGMA² is the variance of the Gaussian; INTEGRATION_RADIUS is the
// bounding sphere used for ray entry/exit (set to ~1.6× the visible
// bulge radius so the Gaussian's tail past the nominal silhouette is
// still captured — past 1.6×, ρ ≈ 0.6%, visually invisible).
// OPACITY scales the integrated optical depth before the
// Beer-Lambert exp; BRIGHTNESS scales the final output colour.
const BULGE_RADIUS: f32              = 0.125;
const BULGE_INTEGRATION_RADIUS: f32  = 0.20;
const BULGE_SIGMA_SQ: f32            = 0.0078125;  // 0.5 · BULGE_RADIUS²
const BULGE_STEPS: i32               = 16;
const BULGE_OPACITY: f32             = 6.0;
const BULGE_BRIGHTNESS: f32          = 1.7;

// Disc halo — anisotropic Gaussian.  Two independent sigmas: a wide
// in-plane sigma (so the halo extends out across the full disk
// extent) and a *very* narrow disk-normal sigma (so the halo reads
// as a 'razor-thin haze in the disk plane' rather than a puffy cloud).
// Without this halo the inter-arm regions are pure black between
// arms and the spiral fades to nothing at the edges; with it, there
// is a soft warm baseline that keeps the arms visually anchored.
//
// SIGMA_R and SIGMA_Y are the standard deviations in shader units;
// the squared values are pre-computed because the integrand uses
// them in the exp() denominator on every step.
const DISC_HALO_INTEGRATION_RADIUS: f32 = 1.0;
const DISC_HALO_SIGMA_R_SQ: f32         = 0.25;     // (0.5)²  — in-plane radial scale
const DISC_HALO_SIGMA_Y_SQ: f32         = 0.0025;   // (0.05)² — disk-normal thickness
const DISC_HALO_STEPS: i32              = 16;
const DISC_HALO_OPACITY: f32            = 4.0;
const DISC_HALO_BRIGHTNESS: f32         = 0.45;
// Slightly cooler than COL_DUST so the halo reads as an underlying
// stellar haze, not as more dust.  Inspired by the warm-yellow
// colour of an old-disk stellar population.
const COL_DISC_HALO = vec3<f32>(0.95, 0.92, 0.88);

// ── Ported helpers (see Task 0 of the plan for the original GLSL) ────
//
// 'rot2', 'sabs', 'toPolar', 'toRect' live in lib/math.wesl — the
// same primitives are useful in any shader doing radial domain warps
// or smooth-distance fields. The only rename from the original GLSL
// is 'rot()' → 'rot2()' (see lib/math.wesl docblock for the why).

const TWIRLY: f32 = 2.5;

// GLSL's 'mod2' mutated 'p' in-place via 'inout' and returned the cell
// index 'c'.  WGSL has no 'inout'; we return both via a struct.
struct Mod2Out {
  p: vec2<f32>,
  c: vec2<f32>,
};

fn mod2(p_in: vec2<f32>, size: vec2<f32>) -> Mod2Out {
  // GLSL 'mod' is the floored modulo; WGSL's '%' is truncated and
  // 'fract'-based.  Replicate the GLSL formula explicitly:
  //   mod(x, y) = x - y * floor(x/y)
  let pPlusHalf = p_in + size * 0.5;
  let c = floor(pPlusHalf / size);
  let q = pPlusHalf - size * floor(pPlusHalf / size);
  var out: Mod2Out;
  out.p = q - size * 0.5;
  out.c = c;
  return out;
}

// 'valueNoise2' ('noise1' in the original GLSL), 'hash21' ('rand'),
// and 'raySphere' live in lib/util.wesl. See that file's docblock for
// the rename rationale.

fn twirl(p_in: vec2<f32>, a: f32, z: f32) -> vec2<f32> {
  var pp = toPolar(p_in);
  pp.y = pp.y + pp.x * TWIRLY + a;
  let p = toRect(pp) * z;
  return p;
}

fn galaxy(p: vec2<f32>, a: f32, z: f32, tm: f32) -> f32 {
  return valueNoise2(twirl(p, a, z), tm);
}

fn stars(p_in: vec2<f32>) -> vec3<f32> {
  // Polar squish gives the inner stars more density.
  var pp = toPolar(p_in);
  pp.x = pp.x / ((1.0 + length(pp.x)) * 0.5);
  var p = toRect(pp);

  let sz: f32 = 0.0075;
  var s = vec3<f32>(10000.0);

  for (var i: i32 = 0; i < 3; i = i + 1) {
    p = rot2(p, 0.5);
    let m = mod2(p, vec2<f32>(sz));
    let r = hash21(m.c);
    let o = -1.0 + 2.0 * vec2<f32>(r, fract(r * 1000.0));
    s.x = min(s.x, length(m.p - 0.25 * sz * o));
    s.y = m.c.x * 0.1;
    s.z = m.c.y * 0.1;
  }
  return s;
}

// SABS is a smooth absolute-value: linear far from zero, parabolic near
// zero with knee 'k'.  GLSL macro: 'LESS((.5/k)*x*x+k*.5,abs(x),abs(x)-k)'.
// 'LESS(a, b, c) = mix(a, b, step(0., c))' — i.e., 'c >= 0' ? b : a.
// Substituting 'c = abs(x) - k': when '|x| >= k' use 'abs(x)', else use
// the parabolic blend.  WGSL 'select' does the same job.
fn height(p: vec2<f32>, tm: f32) -> f32 {
  let ang = atan2(p.y, p.x);
  let l = length(p);
  let sp = mix(1.0, pow(0.75 + 0.25 * sin(2.0 * (ang + l * TWIRLY)), 3.0), tanh(6.0 * l));
  var s: f32 = 0.0;
  var a: f32 = 1.0;
  var f: f32 = 15.0;
  var d: f32 = 0.0;
  for (var i: i32 = 0; i < 11; i = i + 1) {
    let g = a * galaxy(p, tm * (0.025 * f32(i)), f, tm);
    s = s + g;
    a = a * sqrt(0.45);
    f = f * sqrt(2.0);
    d = d + a;
  }
  s = s * sp;
  return sabs(-0.25 + s / d, 0.5) * exp(-5.5 * l * l);
}

fn galaxyNormal(p: vec2<f32>, tm: f32) -> vec3<f32> {
  let eps = vec2<f32>(0.000125, 0.0);
  var n: vec3<f32>;
  n.x = height(p - eps.xy, tm) - height(p + eps.xy, tm);
  n.y = 2.0 * eps.x;
  n.z = height(p - eps.yx, tm) - height(p + eps.yx, tm);
  return normalize(n);
}

const COL_DUST = vec3<f32>(1.0, 0.9, 0.75);

fn shadeGalaxyDisk(p_in: vec2<f32>, ro: vec3<f32>, rd: vec3<f32>, d: f32, tm: f32) -> vec3<f32> {
  // ── Hard early-exit outside the disk extent ──────────────────────
  //
  // The original ShaderToy never reaches disk-plane intersections at
  // l > 1 because its synthetic camera always frames the galaxy
  // tightly.  Our world-anchored impostor casts rays from arbitrary
  // user-camera positions, so corner fragments of the impostor quad
  // routinely intersect the disk plane at l ≈ 1.67 (the impostor's
  // half-extent in shader units), well outside the natural disk
  // brightness.  At those positions:
  //
  //   - '0.25 * pow(diff2, 4)' adds ~0.002 white per fragment from
  //     a Phong-like specular term that has no 'h' gating.
  //   - 'stars()' may divide by a near-zero 's.x' for some fragments,
  //     producing NaN that propagates through 'tanh'/'mix'/'clamp'.
  //   - The dust integral inside this function adds ~tiny dust haze
  //     when h ≈ 0 makes ddust ≈ d.
  //
  // Merely multiplying the final result by 'exp(-5.5*l²)' is not
  // enough — NaN times anything is still NaN, and any value the GPU
  // lifts to the HDR target via additive blending can wash out
  // catalog points behind the impostor's quad (symptom: a tilted
  // black rectangle the shape of the quad, with catalog points
  // missing inside it).
  //
  // The bulletproof fix: return a hard zero outside l = 0.95.  This
  // is INSIDE the disk's natural brightness floor — at l = 0.95,
  // exp(-5.5*0.9) = 4.9e-3 (already pretty dim) — while the NaN-risk
  // zone at l ≈ 1.0–1.2 (pow(0, near-zero), 1/s.x when s.x ≈ 0;
  // symptom: a black ring) lies entirely past the cut.  Cutting at
  // 0.95 trades a slightly more abrupt outer disk edge for
  // guaranteed-zero output in the NaN-risk zone.
  let p_check = rot2(p_in, 0.5 * tm);
  let l_check = length(p_check);
  if (l_check > 0.95) { return vec3<f32>(0.0); }

  let p = p_check;
  let h = height(p, tm);
  let s = stars(p);
  let th = tanh(h);
  let n = galaxyNormal(p, tm);

  let p3 = vec3<f32>(p.x, th, p.y);
  let lh: f32 = 0.5;
  let lp1 = vec3<f32>(0.0, lh, 0.0);
  let ld1 = normalize(lp1 - p3);
  let lp2 = vec3<f32>(0.0, lh, 0.0);
  let ld2 = normalize(lp2 - p3);

  let l = length(p);
  let tl = tanh(l);

  // (diff1 was commented out in the original ShaderToy and is omitted.)
  let diff2 = max(dot(ld2, n), 0.0);

  var col = vec3<f32>(0.0);
  col = col + vec3<f32>(0.5, 0.5, 0.75) * h;
  col = col + 0.25 * pow(diff2, 4.0);
  // The third additive term mixes between (0.5, 1.0, 1.5) and its zyx
  // swap (1.5, 1.0, 0.5) — written explicitly here for review clarity.
  let warmCool = mix(vec3<f32>(0.5, 1.0, 1.5), vec3<f32>(1.5, 1.0, 0.5), 1.25 * tl);
  col = col + pow(vec3<f32>(0.5) * h, n.y * 1.75 * warmCool);

  let sr = hash21(s.yz);
  let si = pow(th * sr, 0.25) * 0.001;
  var scol = sr * 5.0 * exp(-2.5 * l * l) * tanh(pow(si / s.x, 2.5))
    * mix(vec3<f32>(0.5, 0.75, 1.0), vec3<f32>(1.0, 0.75, 0.5), sr * 0.6);
  scol = clamp(scol, vec3<f32>(0.0), vec3<f32>(1.0));
  col = col + scol * smoothstep(0.0, 0.35, 1.0 - n.y);

  let ddust = (h - ro.y) / rd.y;
  if (ddust < d) {
    let t = d - ddust;
    col = col + 0.7 * COL_DUST * (1.0 - exp(-2.0 * t));
  }

  // ── Disk-extent envelope ─────────────────────────────────────────
  //
  // The original ShaderToy's hard-coded camera ALWAYS framed the
  // galaxy with disk-plane intersections inside l ≈ 1 shader unit.
  // In that regime, every term in this function either naturally
  // fades with 'h' (which carries 'exp(-5.5*l*l)') or never reaches
  // a fragment outside the disk extent in the first place.
  //
  // Our world-anchored impostor breaks that invariant — corner
  // fragments of the impostor quad cast rays whose disk-plane
  // intersections sit at l ≈ 1.67 shader units (the impostor's
  // half-extent in shader units), well outside the natural disk
  // extent.  Two terms inside this function CONTRIBUTE non-trivially
  // out there even though they shouldn't:
  //
  //   1. '0.25 * pow(diff2, 4)' — Phong-like specular off the disk's
  //      'surface'.  'diff2' depends only on the surface normal and
  //      light position; both are well-defined for any p, so the
  //      term contributes ~0.002 per channel uniformly across the
  //      whole disk plane.
  //   2. The dust integral '0.7 * COL_DUST * (1 - exp(-2*t))' — 't'
  //      is non-zero whenever 'ddust < d', which happens for nearly
  //      every fragment when h ≈ 0 makes ddust ≈ d − ε.
  //
  // With pure additive blending, those tiny per-fragment
  // contributions add up across the impostor's full quad coverage
  // into a uniform haze that, after tone-mapping, washes out catalog
  // points sitting behind it — a tilted dark rectangle exactly the
  // impostor's quad shape.
  //
  // Fix: multiply the entire output by 'exp(-5.5*l*l)' — the same
  // disk-extent factor 'height' already uses internally.  Inside the
  // disk (l ≤ 1) the multiplier is ~1 (unchanged); outside (l > 1)
  // it falls off rapidly so off-disk haze contributes effectively
  // zero.  The impostor quad's edges stay invisible; only the actual
  // galaxy renders.
  let extentEnvelope = exp(-5.5 * l * l);
  return col * extentEnvelope;
}

fn renderGalaxy(ro: vec3<f32>, rd: vec3<f32>, tm: f32) -> vec3<f32> {
  let dgalaxy = (0.0 - ro.y) / rd.y;

  var col = vec3<f32>(0.0);

  if (dgalaxy > 0.0) {
    let p = ro + dgalaxy * rd;
    col = shadeGalaxyDisk(p.xz, ro, rd, dgalaxy, tm);
  }

  // ── Ray-marched soft bulge ───────────────────────────────────────
  //
  // The ShaderToy original used '1.7 * (1 - exp(-chord))' where
  // 'chord' is the geometric chord length through a uniform-density
  // sphere.  That has TWO problems for a world-anchored impostor:
  //
  //   1. Asymmetric truncation — the original 'min(t0, t1)' clipped
  //      the chord to 'above the disk plane' so the bulge looked
  //      like a crescent.  Fine for the ShaderToy's hard-coded
  //      vantage, broken when the user can orbit and would see one
  //      side vanish.
  //
  //   2. Hard silhouette — uniform density inside, zero outside.
  //      Chord goes to zero at the geometric edge with INFINITE
  //      slope ('chord = 2·sqrt(r² - b²)' near impact-parameter b
  //      = r), so the rendered brightness has a sharp circular cut.
  //
  // Fix #1: drop the disk-plane truncation, use the full chord.
  // Fix #2: replace the uniform-density assumption entirely with a
  // GAUSSIAN density profile, ray-marched in a small loop.  Because
  // the density itself approaches zero before the integration sphere
  // boundary, the silhouette is naturally soft — there is no hard
  // density-to-zero transition, only a smooth Gaussian tail.  No 2D
  // screen-space hack required.
  let bulgeHits = raySphere(ro, rd, vec3<f32>(0.0), BULGE_INTEGRATION_RADIUS);

  var bulgeOpticalDepth: f32 = 0.0;
  if (bulgeHits.x < bulgeHits.y) {
    // Clamp the entry t to 0 — when the camera is INSIDE the
    // integration sphere we start the march at the camera position,
    // not behind it.  Without this, viewing from very close in
    // would accumulate spurious flux from negative-s samples.
    let bulgeEntryT = max(bulgeHits.x, 0.0);
    let bulgeChordLen = max(0.0, bulgeHits.y - bulgeEntryT);
    let bulgeStep = bulgeChordLen / f32(BULGE_STEPS);
    for (var i: i32 = 0; i < BULGE_STEPS; i = i + 1) {
      // Midpoint rule — sample at the centre of each sub-interval.
      let sampleT = bulgeEntryT + (f32(i) + 0.5) * bulgeStep;
      let samplePos = ro + sampleT * rd;
      let densityHere = exp(-dot(samplePos, samplePos) / BULGE_SIGMA_SQ);
      bulgeOpticalDepth = bulgeOpticalDepth + densityHere * bulgeStep;
    }
  }

  // Beer-Lambert on the integrated optical depth.  BULGE_OPACITY
  // multiplies the integrated density before the exp() — tuning knob
  // for central brightness without affecting the soft edge.
  col = col + BULGE_BRIGHTNESS * COL_DUST
            * (1.0 - exp(-bulgeOpticalDepth * BULGE_OPACITY));

  // ── Ray-marched thin-disc halo ───────────────────────────────────
  //
  // Even with the spiral-arm structure rendered by 'shadeGalaxyDisk',
  // the inter-arm regions and the disk's outer edges go to nearly
  // black against the HDR target.  Adding a *very thin*, in-plane
  // Gaussian 'haze' gives the disk a soft baseline glow so the arms
  // never completely disappear into the background — a stand-in for
  // the smooth-old-disk stellar population that real galaxies have
  // underneath their visible spiral structure.
  //
  // Anisotropic Gaussian: WIDE in-plane (σ_r ~ half the disk
  // extent), NARROW in the disk-normal direction (σ_y is ~5% of σ_r,
  // so the halo reads as a thin razor of haze in the disk plane
  // rather than a puffy spheroid).  Density:
  //
  //     ρ(p) = exp(-(p.x² + p.z²) / σ_r²)  ·  exp(-p.y² / σ_y²)
  //
  // (The shader's coordinate convention has y as the disk normal —
  // see 'galacticToShader' in lib/util.wesl.)
  let discHits = raySphere(ro, rd, vec3<f32>(0.0), DISC_HALO_INTEGRATION_RADIUS);

  var discOpticalDepth: f32 = 0.0;
  if (discHits.x < discHits.y) {
    let discEntryT = max(discHits.x, 0.0);
    let discChordLen = max(0.0, discHits.y - discEntryT);
    let discStep = discChordLen / f32(DISC_HALO_STEPS);
    for (var i: i32 = 0; i < DISC_HALO_STEPS; i = i + 1) {
      let sampleT = discEntryT + (f32(i) + 0.5) * discStep;
      let samplePos = ro + sampleT * rd;
      let inPlaneRsq = samplePos.x * samplePos.x + samplePos.z * samplePos.z;
      let normalSq = samplePos.y * samplePos.y;
      let densityHere = exp(-inPlaneRsq / DISC_HALO_SIGMA_R_SQ)
                      * exp(-normalSq / DISC_HALO_SIGMA_Y_SQ);
      discOpticalDepth = discOpticalDepth + densityHere * discStep;
    }
  }

  col = col + DISC_HALO_BRIGHTNESS * COL_DISC_HALO
            * (1.0 - exp(-discOpticalDepth * DISC_HALO_OPACITY));

  return col;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  // Animation disabled — 'tm' was the ShaderToy's TIME macro, fed into
  // 'rot(p, 0.5*tm)' for arm rotation and into 'sin(... + tm * ...)'
  // phase modulation in the noise/star samplers.  Locking it to a
  // constant freezes the spiral pattern.  Cosmic timescales make even
  // the original 'slow but alive' animation physically nonsensical
  // (galaxy rotation periods are ~250 Myr); a static impostor reads
  // as a real photographic backdrop instead of a procedural toy.
  // The 'iTime' uniform is retained for ABI symmetry but unread.
  let tm: f32 = 0.0;

  // Original mainImage: q = fragCoord/RESOLUTION; p = -1 + 2*q; p.x *= aspect.
  // Our vertex stage already emits uv in [-1.05, 1.05]² so we use it
  // directly.  The 5%-bleed becomes the smoothstep fade region near
  // the corners — without that bleed the user would see the rectangle
  // edge of the impostor.
  // ── Synthetic camera driven by the user's REAL camera ───────────
  //
  // The original ShaderToy hard-coded a fixed 'ro = vec3(0, 0.7, 2)
  // * 0.75' and a synthesised perspective FOV via '2.5 * ww' — a
  // frozen vantage regardless of where the user's orbit camera
  // actually is (the galaxy would not move as the camera moves).
  //
  // We cast a real-world ray instead:
  //   - 'ro_world' is the user's camera position (already in skymap
  //     world coordinates, equatorial-cartesian).
  //   - 'rd_world' is the per-fragment ray from the camera through
  //     this fragment's world-space position (forwarded by the vertex
  //     stage).  Per-pixel reconstruction means the perspective is
  //     correct even though the impostor is rendered onto a flat
  //     billboard quad — the GPU's standard interpolation gives each
  //     fragment its own world coordinates, and the ray-from-camera
  //     calculation respects the engine's actual viewProj.
  //
  // Both vectors are then rotated into the galactic frame and scaled
  // into the shader's '1 unit = MILKY_WAY_RADIUS_MPC' length system,
  // so the shader's existing math works unchanged: at the original
  // ShaderToy framing distance (length(vec3(0, 0.7, 2)*0.75) ≈ 1.6
  // shader units = ~24 kpc world), the user sees the same dramatic
  // spiral.  Move closer and the perspective steepens; orbit and the
  // disk reveals different angles; flying through the galactic plane
  // shows the disk edge-on with the bulge sphere still rendering.
  let ro_world = u.cameraPosWorld;
  let rd_world = normalize(in.worldPos - u.cameraPosWorld);
  // Rotate into the galactic frame, then permute axes to match the
  // shader's convention (Y = disk normal).
  let ro_gal = galacticToShader(worldToGalactic(ro_world));
  let rd_gal = galacticToShader(worldToGalactic(rd_world));
  // Scale ro into shader units (lengths divided by the Milky Way
  // physical radius).  rd is a unit direction vector — rotation is
  // length-preserving and shader-unit conversion doesn't change a
  // unit vector — so leave rd alone.
  let ro = ro_gal / MILKY_WAY_RADIUS_MPC;
  let rd = rd_gal;

  let col = renderGalaxy(ro, rd, tm);

  // Pipeline blend is PURE ADDITIVE ('dstFactor: 'one'').  Each
  // pixel adds 'col × alpha' to the HDR target; dark fragments
  // contribute zero.
  let alpha = u.fadeAlpha;

  // ── NaN / Inf sanitisation ───────────────────────────────────────
  //
  // The ported ShaderToy math has several near-singular operations
  // that can produce NaN at fragments where the camera ray hits
  // edge-case geometry: 'pow(si / s.x, 2.5)' divides by 's.x', the
  // distance to the nearest random star sample, which can land at
  // ≈ 0 for specific cell offsets; 'pow(vec3(0.5)*h, exponent)' with
  // h ≈ 0 and a near-zero exponent component is implementation-
  // defined; some 'tanh'/'mix'/'clamp' paths propagate any NaN they
  // encounter.  In ADDITIVE blending, even one NaN pixel is fatal —
  // it lands on the HDR target as NaN, the next OVER-blended
  // catalog point reads it back as 'dst', and the multiplication
  // 'dst * (1 - src_alpha)' poisons that pixel forever.  Visually
  // the user sees a 'black ring' or 'black square' tracking the
  // impostor's footprint.
  //
  // WGSL has no 'isnan' predicate, but exploits the IEEE-754 rule
  // that NaN is never equal to itself: 'x != x' is true iff x is
  // NaN.  We use that to mask each component back to 0 if anything
  // upstream produced a NaN.  Inf is also forced to zero (>1e30
  // catches both +Inf and large-but-finite outliers from
  // 'pow(infinity, 2.5)' cases).
  let isFinite = (col == col) & (abs(col) < vec3<f32>(1e30));
  let safeCol = select(vec3<f32>(0.0), col, isFinite);
  return vec4<f32>(safeCol * alpha, alpha);
}
