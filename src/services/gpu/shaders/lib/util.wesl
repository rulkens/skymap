// lib/util.wesl — orphan utilities: single-consumer functions general
// enough to reuse, kept out of their one caller so a second consumer's
// import-and-rename work is already done.
//
// One file, not one-per-function (unlike src/utils/'s usual convention):
// WESL's import-path resolution treats the last path segment as the
// function name, so a per-file split would force imports like
// 'package::lib::util::hash21::hash21' (duplicated leaf). Graduate a
// function to its own domain file once it gains a second consumer AND
// belongs to a coherent domain suite.

// ── noise / hash ─────────────────────────────────────────────────────
//
// hash21 and valueNoise2 come from mrange's CC0 ShaderToy spiral port.
// The names + signatures are domain-neutral, so any procedural pass
// that needs cheap 2D noise can reach for them.

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
// Named hash21, not 'rand': 'rand' implies a stateful pseudo-random
// generator, which this is not — the same input ALWAYS yields the same
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
// doesn't manifest (e.g. per-octave seeds).
fn hash21Hq(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

// hashAvalanche — the mixing tail shared by integerHash3 below and
// generate.wesl's nHash: two xor-shift/multiply rounds that scramble a
// summed hash word. Callers differ upstream (nHash sums a 4th seed term
// with its own z-prime, then normalizes by a slightly different constant),
// so only this shared tail is factored out — extracting more would change
// what one of the two callers returns.
fn hashAvalanche(h: u32) -> u32 {
  var hh = h;
  hh = (hh ^ (hh >> 13u)) * 1274126177u;
  return hh ^ (hh >> 16u);
}

// integerHash3 — Bob Jenkins/Squirrel-family 3-int avalanche: three large
// odd multiplies then two xor-shifts. Promoted here once a second consumer
// (warpNoiseBake.wesl, starGrainBake.wesl) needed the exact same tileable-3D
// hash dustNoiseBake.wesl already had — no diagonal banding at the low
// lattice resolutions those bakes sample (8..128 cells/axis).
fn integerHash3(p: vec3<i32>) -> f32 {
  let x = bitcast<u32>(p.x);
  let y = bitcast<u32>(p.y);
  let z = bitcast<u32>(p.z);
  let h = x * 374761393u + y * 668265263u + z * 2246822519u;
  return f32(hashAvalanche(h)) / 4294967295.0;
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
// which suits a procedural galaxy centre where the bulge should
// dominate without competing high-frequency arm chatter.
//
// Named valueNoise2, not a numbered slot: the name describes the shape
// (value-noise-like) rather than an arbitrary sequence position. The '2'
// suffix is the input dimensionality, matching 'hash21'.
fn valueNoise2(p_in: vec2<f32>, tm: f32) -> f32 {
  let p = p_in * tanh(0.1 * length(p_in));
  let a = cos(p.x);
  let b = cos(p.y);
  let c = cos(p.x * sqrt(3.5) + tm);
  let d = cos(p.y * sqrt(1.5) + tm);
  return a * b * c * d;
}

// ── color ────────────────────────────────────────────────────────────

// hueToRgb — fully-saturated hue -> rgb for hue in [0, 1). Reconstructs
// the three RGB ramps of an HSV wheel at S=1, V=1 directly from the hue:
// each channel is a clamped triangle peaking 1/3 of the wheel apart. The
// caller scales the result by the desired value (brightness). Cheaper and
// branch-free versus a full hsv2rgb with sector selection, for the many
// callers that only ever need the S=1 slice.
//
// Two independent consumers share this exact derivation
// (pickDebugOverlay/fragment.wesl's per-source golden-angle hue,
// milkyWay/ismMap/orientationPresent.wesl's orientation-angle hue) — the
// shared home keeps the two from drifting apart.
fn hueToRgb(h: f32) -> vec3<f32> {
  let r = abs(h * 6.0 - 3.0) - 1.0;
  let g = 2.0 - abs(h * 6.0 - 2.0);
  let b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
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
//
// CPU twin: 'utils/math/raySphereRoots.ts'. It omits the behind-origin
// 'c > 0 && b > 0' sentinel — callers there inspect the returned root
// signs themselves rather than relying on the vec2(-1, -1) miss marker.
//
// Graduation to 'lib/raycast.wesl' is deliberately deferred: a second
// WESL consumer now exists (earth/fragment.wesl's cloud shadow), but the
// geometry domain here is still this one primitive — we move it out once
// it's part of a coherent suite, not on the first shared caller.
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

// rayPlaneY0 — ray intersection with the horizontal plane y=0 (a disc's own
// plane in the frame milkyWay/ismMap's Present shaders share). Returns the
// hit parameter t such that 'ro + t*rd' lies in the plane, or -1.0 — same
// miss-sentinel idiom as raySphere above — when the ray is (near-)parallel
// to the plane (the 1e-6 guard keeps a near-parallel ray from dividing into
// a wild, spuriously-positive t) or the intersection sits behind the origin.
fn rayPlaneY0(ro: vec3<f32>, rd: vec3<f32>) -> f32 {
  if (abs(rd.y) < 1e-6) { return -1.0; }
  let t = -ro.y / rd.y;
  return select(t, -1.0, t <= 0.0);
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
