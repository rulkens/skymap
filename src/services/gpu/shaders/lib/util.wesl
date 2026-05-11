// lib/util.wesl — orphan utilities: useful names today, lib graduates tomorrow.
//
// What lives here: small pure functions that have exactly ONE consumer
// in the engine right now, but whose name and signature are general
// enough that a second consumer is plausible — and whose presence in
// the host renderer file was diluting the file's domain focus.
//
// Why a 'util' bucket and not just leave them inline?
//
// Two reasons. First, the renamed identifiers (see below) are the
// real win — 'rand' is misleading (it's a deterministic hash, not a
// pseudo-random sequence) and 'noise1' is a numbered slot rather than
// a description of the algorithm. Pulling them out of the renderer
// forces us to give them honest names. Second, when the *next*
// renderer wants any of these, the import-and-rename work is already
// done — they just import 'package::lib::util::hash21'.
//
// Why NOT split each function into its own 'lib/<name>.wesl' file?
//
// Same reason 'lib/math.wesl' is consolidated: WESL's import-path
// resolution treats the last path segment as the function name. A
// per-file split would force imports like
// 'package::lib::util::hash21::hash21' (duplicated leaf), which is
// noise. One file with section dividers reads cleaner at the import
// site and at the definition site.
//
// Promotion criterion — when to graduate something out of here:
//
// As soon as a function gains a second consumer AND is part of a
// coherent domain (e.g. multiple noise variants, or a small geometry
// suite), move it to a domain-named file: 'lib/noise.wesl',
// 'lib/raycast.wesl', 'lib/galacticFrame.wesl', etc. Until then it
// sits here and we don't pre-emptively design module boundaries.

// ── noise / hash ─────────────────────────────────────────────────────
//
// Both of these are originally from milkyWayImpostor.wesl's port of
// mrange's CC0 ShaderToy spiral. They're orphaned (the impostor is
// the only caller) but the names + signatures are domain-neutral, so
// any future procedural pass that needs cheap 2D noise can reach for
// them.

// hash21 — deterministic 2D-to-1D hash in [0, 1).
//
// The classic Mediump-shader hash 'fract(sin(dot(p, c)) * k)' with
// the constants Inigo Quilez and the early ShaderToy community
// converged on:
//
//   - vec2(12.9898, 78.233) — two large-ish irrational-ish numbers
//     so that 'dot(p, c)' covers many sine periods even for small p.
//   - 43758.5453 — a magnification chosen so the post-sin fractional
//     bits are well-mixed across the unit interval.
//
// This is NOT a cryptographic or even a high-quality hash; the sin
// transcendental is the only nonlinearity, and it has visible banding
// at high frequencies. It's the cheapest possible "give me a
// deterministic pseudo-random number for this 2D coordinate" on a
// GPU, which is what star-field placement and similar effects need.
//
// Renamed from 'rand' because 'rand' implies a stateful pseudo-random
// generator, which this is not: the same input ALWAYS yields the same
// output. The '21' suffix encodes the type signature (vec2→f32) in
// the GLSL noise-library tradition where you'll also see 'hash22',
// 'hash33', etc.
fn hash21(co: vec2<f32>) -> f32 {
  return fract(sin(dot(co, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

// hash21Hq — higher-quality 2D-to-1D hash in [0, 1).
//
// Dave Hoskins' "Hash without Sine" (https://www.shadertoy.com/view/4djSRW),
// the de-facto upgrade for callers that found hash21's sin-based
// banding visually objectionable.  Three integer-style multiply +
// fract steps that scramble the bits much more thoroughly than a
// single sin; produces no visible coherent patterns at fragment-coord
// frequencies (where hash21 shows diagonal stripes that the eye
// readily latches onto when the camera is moving).
//
// Cost is ~3-4× hash21's: still single-digit ALU ops, still no texture
// fetch.  Cheap enough that screen-space jitter (volume ray-march
// start offset, dithered alpha) should default to this; reserve hash21
// for one-shot uses where the input domain is so sparse the banding
// doesn't manifest (e.g. the milky-way impostor's per-octave seeds).
fn hash21Hq(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

// valueNoise2 — 2D analytic noise via products of cosines.
//
// Not a value-noise grid in the strict Perlin/Worley sense — there's
// no per-cell hashed value being interpolated. Instead it's a
// 4-cosine product that visually behaves like value noise: smooth,
// band-limited, with controllable scale via the input frequency. The
// 'tm' parameter animates two of the four cosines so the noise
// evolves over time without retiling.
//
// The 'p * tanh(0.1 * length(p))' prefix gives radial attenuation:
// near the origin the noise field flattens (tanh→0 for small length),
// which is what the impostor's centre needs so the bulge dominates
// without competing high-frequency arm chatter.
//
// Renamed from 'noise1' (a numbered slot — there was never a 'noise2'
// or 'noise3') to 'valueNoise2' which describes the shape. The '2'
// suffix is the input dimensionality, matching 'hash21'.
fn valueNoise2(p_in: vec2<f32>, tm: f32) -> f32 {
  let p = p_in * tanh(0.1 * length(p_in));
  let a = cos(p.x);
  let b = cos(p.y);
  let c = cos(p.x * sqrt(3.5) + tm);
  let d = cos(p.y * sqrt(1.5) + tm);
  return a * b * c * d;
}

// ── geometry / raycast ───────────────────────────────────────────────

// raySphere — analytic ray vs sphere intersection.
//
// Returns the two roots (entry, exit) of the quadratic
// '|ro + t*rd - center|² = radius²' as a vec2. If the ray misses, or
// the sphere is entirely behind the ray origin (both 'c > 0' meaning
// origin outside, and 'b > 0' meaning sphere centre is behind), we
// return 'vec2(-1, -1)' as a sentinel — caller is expected to test
// 'hits.y > 0.0' before using.
//
// Standard formulation: with 'm = ro - center', the quadratic
// coefficients reduce to
//
//   a = dot(rd, rd) = 1   (since rd is assumed unit-length)
//   b = dot(m, rd)
//   c = dot(m, m) - r²
//
// and roots are '-b ± sqrt(b² - c)'. The early-exit checks save the
// sqrt cost when the ray clearly misses.
fn raySphere(ro: vec3<f32>, rd: vec3<f32>, center: vec3<f32>, radius: f32) -> vec2<f32> {
  let m = ro - center;
  let b = dot(m, rd);
  let c = dot(m, m) - radius * radius;
  if (c > 0.0 && b > 0.0) { return vec2<f32>(-1.0, -1.0); }
  let discr = b * b - c;
  if (discr < 0.0) { return vec2<f32>(-1.0, -1.0); }
  let s = sqrt(discr);
  return vec2<f32>(-b - s, -b + s);
}

// ── galactic-frame transforms ────────────────────────────────────────
//
// Skymap stores positions in equatorial-cartesian world space (J2000),
// but a procedural galaxy shader naturally wants its disk in the
// galactic frame — disk plane = galactic latitude 0, disk normal =
// the North Galactic Pole. These two helpers, plus the rotation
// matrix below, are the bridge.
//
// The rotation matrix is the Liu et al. 2011 update of the IAU 1958
// galactic-coordinate definition. It's a fixed astronomical constant
// — never per-frame — so it lives in code rather than as a uniform,
// letting the optimiser constant-fold the dot products at compile
// time.

// Equatorial → galactic basis vectors. Each row is a unit equatorial
// vector pointing along the named galactic axis:
//   GAL_X_EQ — toward the Galactic Centre        (l=0°,    b=0°)
//   GAL_Y_EQ — direction of Galactic rotation     (l=90°,   b=0°)
//   GAL_Z_EQ — toward the North Galactic Pole     (l=undef, b=90°)
const GAL_X_EQ = vec3<f32>(-0.054876, -0.873437, -0.483835);
const GAL_Y_EQ = vec3<f32>( 0.494109, -0.444830,  0.746982);
const GAL_Z_EQ = vec3<f32>(-0.867666, -0.198076,  0.455984);

// worldToGalactic — rotate a world-space (equatorial) vector into the
// galactic frame.  Output components are (X_gal, Y_gal, Z_gal).
//
// Pure rotation (no translation), so the function is correct for both
// position vectors (relative to the world origin = Sun position) and
// direction vectors (camera ray, etc).
fn worldToGalactic(v: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(dot(GAL_X_EQ, v), dot(GAL_Y_EQ, v), dot(GAL_Z_EQ, v));
}

// galacticToShader — swizzle a galactic-frame vector into the
// 'shader-local' frame the procedural galaxy code uses.
//
// The original ShaderToy spiral works in a frame where the disk plane
// is y=0 and y is the disk normal. In the galactic frame, the disk
// normal is the Z axis (NGP), so we map:
//
//   shader.x = galactic.X (toward GC)              — in-disk
//   shader.y = galactic.Z (toward NGP)             — disk normal
//   shader.z = galactic.Y (rotation direction)     — in-disk
//
// Cheap: it's a pure swizzle, no FLOPs. Kept as a named function
// rather than inlined because the call site reads as a domain
// operation ('galactic to shader'), not a coordinate juggle.
fn galacticToShader(g: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(g.x, g.z, g.y);
}
