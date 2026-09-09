// lib/math.wesl — small math primitives shared across the renderer.
//
// What lives here: scalar constants and pure functions that are used
// by more than one shader (or are likely to be), are short enough that
// a per-fn file would be more ceremony than signal, and don't have
// renderer-specific dependencies. The grouping is "math primitives";
// it's not a kitchen sink — anything with a richer API (camera,
// billboard, color ramp) lives in its own file.
//
// Why one file rather than one-fn-per-file? An earlier draft of this
// module split each function into its own file under 'lib/math/'.
// WESL's import-resolution model treats the last segment of an
// import path as the function name and the rest as the module path,
// so 'import package::lib::math::saturate;' looks for a function
// 'saturate' inside a module at 'lib/math.wesl' — not at
// 'lib/math/saturate.wesl'. To preserve one-fn-per-file we'd have to
// write 'import package::lib::math::saturate::saturate;' (with the
// duplicated leaf), which is verbose noise. Consolidating into one
// module keeps the import sites short and matches the WESL idiom.
//
// Each primitive keeps its own comment block; reading top to bottom
// here is equivalent to reading the previous per-file docblocks in
// sequence.

// ── constants ────────────────────────────────────────────────────────
//
// Consolidated from hand-typed '3.14159...' and '2.30258...' literals
// that recurred across shaders. Centralising gives us one place to
// bump precision if compute shaders ever need f64-equivalent
// constants.

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717958;
const LOG10: f32 = 2.30258509299404;  // ln(10), for converting log/ln

// ── saturate ─────────────────────────────────────────────────────────
//
// WGSL has no built-in 'saturate' the way HLSL/GLSL ES do; the
// canonical spelling is 'clamp(x, 0.0, 1.0)'. That recurs ~20× across
// the engine's shaders. Wrapping it in a named primitive gives us:
//
//   1. A grep target — every "snap into [0, 1]" site is now
//      'saturate(...)' and trivially auditable.
//   2. Portability — when WGSL eventually grows a real 'saturate'
//      builtin, this becomes a one-line shim and call sites stay put.
//   3. Reading clarity — 'saturate' encodes intent ("force into the
//      visible alpha range") whereas 'clamp(x, 0, 1)' encodes only
//      mechanism.

fn saturate(x: f32) -> f32 {
  return clamp(x, 0.0, 1.0);
}

// ── rot2 ─────────────────────────────────────────────────────────────
//
// 2D rotation of a point around the origin. Named 'rot2' so the
// bare name 'rot' is free for a future 'rot3' (axis-angle 3D rotation
// for camera-frame helpers); the "2" tag matches the WGSL pattern of
// suffixing a dimensional hint to a free-function name (cf. 'vec2',
// 'mat2x2', 'fract').
//
// Returned as a fresh vec2 (no in-place mutation, unlike the
// ShaderToy GLSL original which used 'inout vec2 p') so it composes
// cleanly inside expressions: 'sabs(rot2(p, t).x, 0.1)' just works.

fn rot2(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x + s * p.y, -s * p.x + c * p.y);
}

// ── sabs (smooth absolute value) ─────────────────────────────────────
//
// 'sabs(x, k)' approximates 'abs(x)' but is C¹-continuous at x = 0.
// The classic 'abs' has a kink at the origin; any analytic process
// that takes derivatives across that kink (height-field normals,
// implicit-surface gradients, anti-aliased silhouettes) ends up with
// a discontinuous result that visually shows as a sharp seam.
// 'sabs' replaces the kink with a smooth parabolic blend whose
// "knee" width is controlled by 'k'.
//
// Form: linear (= 'abs(x)') when '|x| >= k', parabolic with the same
// value + slope at the join when '|x| < k'. Larger 'k' → wider soft
// region → smoother but more rounded. k → 0 recovers exact 'abs(x)'.
//
// Implementation note: this is the GLSL macro
//   LESS((.5/k)*x*x + k*.5,  abs(x),  abs(x) - k)
// where 'LESS(a, b, c) = mix(a, b, step(0, c))', i.e. 'c >= 0 ? b : a'.
// WGSL's 'select(a, b, cond)' inverts the C-style ternary operand
// order: 'select(a, b, cond) = cond ? b : a', which matches GLSL
// 'LESS' exactly.

fn sabs(x: f32, k: f32) -> f32 {
  let a = (0.5 / k) * x * x + k * 0.5;
  let ax = abs(x);
  return select(a, ax, ax >= k);
}

// ── toPolar / toRect ─────────────────────────────────────────────────
//
// Cartesian (x, y) ↔ polar (r, θ). For procedural passes that
// round-trip points through polar coords to apply rotation-symmetric
// transformations (multiply θ by an angular frequency, scale r
// non-linearly, etc.).
//
// Convention for both: vec2(r, theta) with theta in radians, range
// (-PI, PI] (the WGSL 'atan2' contract). 'toPolar' and 'toRect' are
// inverses for any finite vec2 input where length(p) > 0.
//
// Edge case: 'atan2(0, 0)' is implementation-defined in WGSL — most
// hardware returns 0 but a few return NaN. Callers that pass a
// possibly-zero point should guard upstream; we don't guard here
// because the per-call branch cost is wasted in the common case
// where the caller already knows p is non-zero.

fn toPolar(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(length(p), atan2(p.y, p.x));
}

fn toRect(p: vec2<f32>) -> vec2<f32> {
  return p.x * vec2<f32>(cos(p.y), sin(p.y));
}

// ── rotateAroundAxis ─────────────────────────────────────────────────
//
// Rodrigues' rotation formula: rotate 'v' by 'angleRad' about 'axis'
// (right-hand rule). First consumer: the Sgr A* lens fragment
// (bodies/sgrAStarLensing/fragment.wesl), which has no camera-basis
// uniform to build a billboard/deflection frame from and derives both
// from a single direction vector instead — a general enough primitive
// to live beside 'rot2' rather than inline in that one shader.
//
// 'axis' MUST already be a unit vector — the formula silently returns a
// scaled/skewed result for a non-unit axis rather than erroring, so
// every call site normalizes its own axis before calling this.

fn rotateAroundAxis(v: vec3<f32>, axis: vec3<f32>, angleRad: f32) -> vec3<f32> {
  let c = cos(angleRad);
  let s = sin(angleRad);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
