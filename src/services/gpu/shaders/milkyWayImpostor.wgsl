// License CC0: Spiral galaxy
// Ported to WGSL from the original ShaderToy GLSL (CC0).  See plan
// docs/superpowers/plans/2026-05-04-milky-way-impostor.md Task 0 for
// the verbatim original source and the WGSL-port deltas.
//
// ─────────────────────────────────────────────────────────────────────
//
// milkyWayImpostor.wgsl — single-quad procedural Milky Way at world origin.
//
// This pass renders ONE screen-aligned quad that covers the full
// viewport (plus a 5% bleed margin on each side, so the fragment-side
// smoothstep edge fade has room to come down to zero before the
// quad's hard edge).  The fragment stage runs a ray-marched procedural
// galaxy that gives the viewer a sense of being "inside" the Milky Way.
//
// The impostor is purely cosmetic — there is no Milky Way row in any
// of the three catalogs (SDSS, 2MRS, GLADE) at the world origin, so
// without this pass the user looks at empty space when they look "down"
// at Earth.  With it, they see a slowly-rotating spiral that visually
// anchors the rendered universe to a meaningful "here".
//
// ── Why screen-aligned, not world-fixed disk plane?
//
// A future enhancement would orient the quad to lie in the actual
// galactic disk plane (Galactic latitude 0°), which in the equatorial
// J2000 coordinates this engine uses corresponds to a tilted plane
// rotated ~62.6° from the celestial equator.  That would be visually
// more "correct" but requires a per-camera-distance fudge so the disk
// looks dramatic at small distances and flat at larger ones, and the
// user would see a thin streak instead of a face-on spiral when
// looking edge-on.  Screen-aligned matches the ShaderToy's 2D framing
// directly — the camera orbits AROUND the galaxy in the shader's own
// coordinates, regardless of where it sits in skymap world space.
//
// ── Why output linear HDR colour?
//
// Every other pass in this engine writes linear-light into the rgba16f
// HDR target and the tone-map pass downstream applies the curve +
// exposure + (sRGB conversion via swap-chain format).  The original
// ShaderToy applied display-space gamma (`pow(col, 0.75)`), a contrast
// S-curve, a saturation pump, and a vignette in its `postProcess`
// function — all of which are display-space operations that would
// double-up with the engine's tone-map pass and produce muddy crushed
// blacks.  Those four operations are DELETED, not ported.
//
// ── Coordinate convention inside the fragment stage
//
// The fragment receives `uv` in `[-1.05, 1.05]²` (the 5% bleed
// margin).  We feed `uv` directly into the ShaderToy's `mainImage`
// equivalent as the "p" vector after aspect-ratio normalisation —
// since the vertex stage already pre-stretches the quad in clip-space
// to compensate for non-square viewports, the fragment shader sees a
// square-aspect-ratio uv and doesn't need to know iResolution.
//
// ── ShaderToy → WGSL specific notes
//
//   - GLSL `inout` parameters in `mod2(inout vec2 p, ...)` and
//     `rot(inout vec2 p, ...)` become value-returning helpers that
//     return the modified value (and a struct for `mod2`'s two-output
//     case).
//   - The two `galaxy()` overloads (one taking `(vec2 p, float a,
//     float z)` for the noise hatching, one taking `(vec2 p, vec3 ro,
//     vec3 rd, float d)` for the full disk shading) collide in WGSL
//     which has no overloading.  We rename the four-arg overload to
//     `shadeGalaxyDisk` and keep the three-arg one as `galaxy`.
//   - `for (int i = 0; i < 11; ++i)` becomes `for (var i: i32 = 0; i
//     < 11; i = i + 1)`.

struct Uniforms {
  // World-space view-projection matrix.  The vertex stage uses this to
  // place the world-anchored impostor quad correctly in clip space —
  // the impostor is centred at the world origin (Earth/Sun position
  // in the catalogue's coordinate system) and its angular size scales
  // naturally as the user moves the camera closer / further.
  viewProj: mat4x4<f32>,
  // Viewport (px) — UNUSED.  Kept for ABI symmetry with the other GPU
  // passes that all use it for pxPerRad-style derivations.
  viewport: vec2<f32>,
  // Distance-fade alpha pre-computed on the CPU
  // (`utils/math/milkyWayFade.ts`).  Multiplied into the fragment's
  // emissive output and into alpha for premultiplied blend.
  fadeAlpha: f32,
  // iTime in seconds, scaled by 0.25 on the CPU before upload so the
  // ShaderToy's internal `TIME = iTime*0.1` works out to a slow,
  // alive-but-not-spinning rotation.
  iTime: f32,
  // World-space camera position (Mpc).  Used by the vertex stage to
  // build the view-aligned billboard basis (the impostor always faces
  // the camera, so the user never sees its rectangular edge), and by
  // the fragment stage to drive the ShaderToy's synthetic camera —
  // transformed into the galactic frame and divided by the Milky Way's
  // physical half-extent, it becomes the `ro` parameter to the existing
  // raymarched render logic.  As the user orbits the world origin, the
  // shader sees a corresponding rotation of its synthetic camera, so
  // the rendered spiral appears from different angles instead of
  // staying frozen in the original ShaderToy's hard-coded vantage.
  cameraPosWorld: vec3<f32>,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  // Local UV in [-1, 1]² (the corner offsets used to build the quad).
  // The fragment stage uses these for the soft edge fade only — the
  // synthetic-camera ray direction is now reconstructed from the
  // *world-space* fragment position (see VsOut.worldPos) so the
  // perspective is correct regardless of the impostor's screen size.
  @location(0) uv: vec2<f32>,
  // World-space position of this fragment's corresponding vertex.
  // The fragment stage interpolates this across the quad and
  // reconstructs the per-pixel world-space ray as
  // `normalize(worldPos - cameraPosWorld)` — the actual ray that hits
  // this point on the impostor from the user's viewpoint.
  @location(1) worldPos: vec3<f32>,
};

// Six corners of a unit quad in [-1, 1]², triangle-list order.  The
// vertex stage scales them by the Milky Way's half-extent and orients
// them on a view-aligned billboard plane centred at the world origin
// — see the vs() doc-comment for the full derivation.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0, -1.0),
  vec2<f32>( 1.0,  1.0),
  vec2<f32>(-1.0,  1.0),
);

// ── Physical scale ──────────────────────────────────────────────────
//
// Milky Way disk diameter ≈ 30 kpc.  We use a generous half-extent of
// 25 kpc = 0.025 Mpc for the impostor billboard so the disk's outer
// exponential falloff (`exp(-5.5*l*l)` in the fragment stage) and the
// surrounding diffuse dust have visible breathing room before the
// quad's edge cuts them off.  The shader's internal "1 unit" — the
// scale at which the bulge raySphere has radius 0.125 (≈ 3 kpc) and
// the disk's brightness vanishes at l ≈ 0.7 — matches a galaxy radius
// of approximately 15 kpc, so we divide world-space lengths by
// MILKY_WAY_RADIUS_MPC = 0.015 to convert into shader units.
const MILKY_WAY_RADIUS_MPC: f32 = 0.015;
const MILKY_WAY_HALFEXTENT_MPC: f32 = 0.025;

// ── Equatorial → galactic rotation matrix (J2000) ───────────────────
//
// Standard fixed astronomical transformation (Liu et al. 2011 update
// of the IAU 1958 definition).  Each row is a unit equatorial vector
// in the galactic system's three principal directions:
//
//   row 0 — galactic X axis (toward the Galactic Centre)
//   row 1 — galactic Y axis (direction of Galactic rotation, l=90°)
//   row 2 — galactic Z axis (toward the North Galactic Pole)
//
// Hardcoded in the shader (rather than uploaded as a uniform) because
// the matrix is a fixed constant for any J2000-epoch galactic frame
// and never changes per-frame — keeping it in code lets the optimiser
// constant-fold the dot products.
const GAL_X_EQ = vec3<f32>(-0.054876, -0.873437, -0.483835);
const GAL_Y_EQ = vec3<f32>( 0.494109, -0.444830,  0.746982);
const GAL_Z_EQ = vec3<f32>(-0.867666, -0.198076,  0.455984);

// Rotate a world-space (equatorial-cartesian) vector into the
// galactic frame.  Result components are (X_gal, Y_gal, Z_gal) — i.e.
// the projection of the input onto each galactic basis axis.  Pure
// rotation (no translation), so this is valid for both positions
// (relative to the world origin) and direction vectors.
fn worldToGalactic(v: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(dot(GAL_X_EQ, v), dot(GAL_Y_EQ, v), dot(GAL_Z_EQ, v));
}

// Convert a galactic-frame vector (X=GC, Y=rotation, Z=NGP) into the
// shader's local frame, where the disk lies in the y=0 plane and y is
// the disk normal.  The original ShaderToy uses `(0.0 - ro.y)/rd.y`
// as the disk-plane intersection, so its Y axis must be the disk
// normal — which is the galactic Z (NGP) direction.
//
//   shader.x = galactic.X (toward GC)            — in-disk
//   shader.y = galactic.Z (toward NGP)           — disk normal
//   shader.z = galactic.Y (direction of rotation)— in-disk
fn galacticToShader(g: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(g.x, g.z, g.y);
}

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VsOut {
  let c = CORNERS[vid];

  // ── View-aligned billboard basis ──────────────────────────────────
  //
  // The impostor is centred at the world origin (the catalogue origin
  // = Earth/Sun position in skymap world space).  We orient the quad
  // perpendicular to the view direction so the user never sees its
  // rectangular edge, and size each corner offset by the Milky Way's
  // physical half-extent.  Result: the impostor's angular size on
  // screen scales as `2 * atan(halfExtent / cameraDistance)` — full
  // screen when the camera is right next to the origin, vanishing to
  // a dot when the camera is far away.  This is the "right physical
  // size" the previous all-clip-space implementation lacked.
  //
  // Why not orient the quad in the galactic disk plane?  Two reasons.
  // First, viewing edge-on would collapse the quad to a zero-area
  // sliver and the bulge (which is a sphere, not a disk) would still
  // need to render — the view-aligned billboard sidesteps this.
  // Second, the fragment stage's volumetric raymarching naturally
  // produces a 3D-looking spiral from any vantage, so the orientation
  // of the BACKING quad doesn't affect the rendered look — only the
  // *synthetic camera* inside the shader does, and we drive that
  // separately from `cameraPosWorld` in the fragment stage.
  let lookDir = normalize(-u.cameraPosWorld);
  // World-up reference for the cross-product basis.  This MUST match
  // the OrbitCamera's `lookAt` up-vector convention or the
  // billboard's basis tilts relative to the camera's actual screen
  // axes — the user-visible failure mode was "the bulge disappears
  // on one side when looking head-on to the disk", caused by the
  // billboard rotating around the view direction so its quad's
  // angular coverage didn't line up with the screen's rectangular
  // viewport.
  //
  // OrbitCamera (`computeViewProj` in `orbitCamera.ts`) uses world
  // +Y as the up reference for `mat4.lookAt`, with the orbit-
  // controls module clamping pitch to ±(π/2 − ε) to keep the lookAt
  // matrix non-degenerate.  We mirror that exactly: worldUp = +Y,
  // and the same pitch clamp upstream guarantees `cross(lookDir,
  // +Y)` is non-degenerate so we never need to use the pole
  // fallback in practice.  The fallback is kept defensively for
  // the (currently impossible) case where pitch reaches the pole.
  let worldUp = vec3<f32>(0.0, 1.0, 0.0);
  let upDot = abs(dot(lookDir, worldUp));
  let upRef = select(worldUp, vec3<f32>(0.0, 0.0, 1.0), upDot > 0.999);
  let right = normalize(cross(lookDir, upRef));
  let up = cross(right, lookDir);

  // Build the world-space corner position.  Multiplied by the half-
  // extent so the quad spans 2 × halfExtent in world units (matching
  // the [-1, 1] range of the corner UV).
  let worldPos = (c.x * right + c.y * up) * MILKY_WAY_HALFEXTENT_MPC;

  var out: VsOut;
  out.clipPos = u.viewProj * vec4<f32>(worldPos, 1.0);
  out.uv = c;
  out.worldPos = worldPos;
  return out;
}

// ── Ported helpers (see Task 0 of the plan for the original GLSL) ────

const TWIRLY: f32 = 2.5;

fn toPolar(p: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(length(p), atan2(p.y, p.x));
}

fn toRect(p: vec2<f32>) -> vec2<f32> {
  return p.x * vec2<f32>(cos(p.y), sin(p.y));
}

// GLSL's `mod2` mutated `p` in-place via `inout` and returned the cell
// index `c`.  WGSL has no `inout`; we return both via a struct.
struct Mod2Out {
  p: vec2<f32>,
  c: vec2<f32>,
};

fn mod2(p_in: vec2<f32>, size: vec2<f32>) -> Mod2Out {
  // GLSL `mod` is the floored modulo; WGSL's `%` is truncated and
  // `fract`-based.  Replicate the GLSL formula explicitly:
  //   mod(x, y) = x - y * floor(x/y)
  let pPlusHalf = p_in + size * 0.5;
  let c = floor(pPlusHalf / size);
  let q = pPlusHalf - size * floor(pPlusHalf / size);
  var out: Mod2Out;
  out.p = q - size * 0.5;
  out.c = c;
  return out;
}

fn noise1(p_in: vec2<f32>, tm: f32) -> f32 {
  let p = p_in * tanh(0.1 * length(p_in));
  let a = cos(p.x);
  let b = cos(p.y);
  let c = cos(p.x * sqrt(3.5) + tm);
  let d = cos(p.y * sqrt(1.5) + tm);
  return a * b * c * d;
}

fn rot(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x + s * p.y, -s * p.x + c * p.y);
}

fn twirl(p_in: vec2<f32>, a: f32, z: f32) -> vec2<f32> {
  var pp = toPolar(p_in);
  pp.y = pp.y + pp.x * TWIRLY + a;
  let p = toRect(pp) * z;
  return p;
}

fn galaxy(p: vec2<f32>, a: f32, z: f32, tm: f32) -> f32 {
  return noise1(twirl(p, a, z), tm);
}

fn rand(co: vec2<f32>) -> f32 {
  return fract(sin(dot(co, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

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

fn stars(p_in: vec2<f32>) -> vec3<f32> {
  // Polar squish gives the inner stars more density.
  var pp = toPolar(p_in);
  pp.x = pp.x / ((1.0 + length(pp.x)) * 0.5);
  var p = toRect(pp);

  let sz: f32 = 0.0075;
  var s = vec3<f32>(10000.0);

  for (var i: i32 = 0; i < 3; i = i + 1) {
    p = rot(p, 0.5);
    let m = mod2(p, vec2<f32>(sz));
    let r = rand(m.c);
    let o = -1.0 + 2.0 * vec2<f32>(r, fract(r * 1000.0));
    s.x = min(s.x, length(m.p - 0.25 * sz * o));
    s.y = m.c.x * 0.1;
    s.z = m.c.y * 0.1;
  }
  return s;
}

// SABS is a smooth absolute-value: linear far from zero, parabolic near
// zero with knee `k`.  GLSL macro: `LESS((.5/k)*x*x+k*.5,abs(x),abs(x)-k)`.
// `LESS(a, b, c) = mix(a, b, step(0., c))` — i.e., `c >= 0` ? b : a.
// Substituting `c = abs(x) - k`: when `|x| >= k` use `abs(x)`, else use
// the parabolic blend.  WGSL `select` does the same job.
fn sabs(x: f32, k: f32) -> f32 {
  let a = (0.5 / k) * x * x + k * 0.5;
  let ax = abs(x);
  return select(a, ax, ax >= k);
}

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
  //   - `0.25 * pow(diff2, 4)` adds ~0.002 white per fragment from
  //     a Phong-like specular term that has no `h` gating.
  //   - `stars()` may divide by a near-zero `s.x` for some fragments,
  //     producing NaN that propagates through `tanh`/`mix`/`clamp`.
  //   - The dust integral inside this function adds ~tiny dust haze
  //     when h ≈ 0 makes ddust ≈ d.
  //
  // Multiplying the final result by `exp(-5.5*l²)` (an earlier
  // attempt) wasn't enough — NaN times anything is still NaN, and
  // any value the GPU lifts to the HDR target via additive blending
  // can wash out catalog points behind the impostor's quad.  The
  // user reported a "tilted black rectangle" with catalog points
  // missing inside the impostor's screen-space footprint; toggling
  // the impostor off restored them.
  //
  // The bulletproof fix: return a hard zero outside l = 0.95.  This
  // is INSIDE the disk's natural brightness floor — at l = 0.95,
  // exp(-5.5*0.9) = 4.9e-3 (already pretty dim), and the user
  // reported a "black ring" at l ≈ 1.0–1.2 caused by NaN propagation
  // from the dim-tail terms (pow(0, near-zero), 1/s.x when s.x ≈ 0).
  // Cutting at 0.95 trades a slightly more abrupt outer disk edge
  // for guaranteed-zero output in the NaN-risk zone.
  let p_check = rot(p_in, 0.5 * tm);
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

  let sr = rand(s.yz);
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
  // The original ShaderToy was written for a hard-coded camera that
  // ALWAYS framed the galaxy with disk-plane intersections inside l ≈
  // 1 shader unit.  In that regime, every term in this function
  // either naturally fades with `h` (which carries `exp(-5.5*l*l)`)
  // or never reaches a fragment outside the disk extent in the first
  // place.
  //
  // Our world-anchored impostor breaks that invariant — corner
  // fragments of the impostor quad cast rays whose disk-plane
  // intersections sit at l ≈ 1.67 shader units (the impostor's
  // half-extent in shader units), well outside the natural disk
  // extent.  Two terms inside this function CONTRIBUTE non-trivially
  // out there even though they shouldn't:
  //
  //   1. `0.25 * pow(diff2, 4)` — Phong-like specular off the disk's
  //      "surface".  `diff2` depends only on the surface normal and
  //      light position; both are well-defined for any p, so the
  //      term contributes ~0.002 per channel uniformly across the
  //      whole disk plane.
  //   2. The dust integral `0.7 * COL_DUST * (1 - exp(-2*t))` — `t`
  //      is non-zero whenever `ddust < d`, which happens for nearly
  //      every fragment when h ≈ 0 makes ddust ≈ d − ε.
  //
  // With pure additive blending, those tiny per-fragment
  // contributions add up across the impostor's full quad coverage —
  // the user sees a uniform haze across the impostor's screen-space
  // footprint that, after tone-mapping, washes out catalog points
  // sitting behind it.  The screenshot was a tilted black rectangle
  // exactly the impostor's quad shape; toggling the impostor off
  // restored the catalog underneath.
  //
  // Fix: multiply the entire output by `exp(-5.5*l*l)` — the same
  // disk-extent factor `height` already uses internally.  Inside the
  // disk (l ≤ 1) the multiplier is ~1 (unchanged); outside (l > 1)
  // it falls off rapidly so off-disk haze contributes effectively
  // zero.  Edges of the impostor's quad are now invisible, only the
  // actual galaxy renders.
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

  let cgalaxy = raySphere(ro, rd, vec3<f32>(0.0), 0.125);

  var t: f32 = 0.0;

  if (dgalaxy > 0.0 && cgalaxy.x > 0.0) {
    let t0 = max(dgalaxy - cgalaxy.x, 0.0);
    let t1 = cgalaxy.y - cgalaxy.x;
    t = min(t0, t1);
  } else if (cgalaxy.x < cgalaxy.y) {
    t = cgalaxy.y - cgalaxy.x;
  }

  col = col + 1.7 * COL_DUST * (1.0 - exp(-1.0 * t));

  return col;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  // Match the ShaderToy's `TIME` macro: the inner code uses
  // `tm = iTime * 0.1`.  CPU has already pre-multiplied `iTime` by the
  // outer animation-speed factor of 0.25 (see milkyWayRenderer.ts), so
  // by the time we get here a uniform `iTime` of 1.0 corresponds to
  // 4 seconds of wall-clock time and `tm` becomes 0.1 (slow but alive).
  let tm = u.iTime * 0.1;

  // Original mainImage: q = fragCoord/RESOLUTION; p = -1 + 2*q; p.x *= aspect.
  // Our vertex stage already emits uv in [-1.05, 1.05]² so we use it
  // directly.  The 5%-bleed becomes the smoothstep fade region near
  // the corners — without that bleed the user would see the rectangle
  // edge of the impostor.
  // ── Synthetic camera driven by the user's REAL camera ───────────
  //
  // The original ShaderToy hard-coded a fixed `ro = vec3(0, 0.7, 2)
  // * 0.75` and a synthesised perspective FOV via `2.5 * ww`.  That
  // produced a frozen vantage regardless of where the user's orbit
  // camera actually was — the user reported "the galaxy is not moving
  // around when the camera is moving" precisely because of this.
  //
  // Replace it with a real-world ray:
  //   - `ro_world` is the user's camera position (already in skymap
  //     world coordinates, equatorial-cartesian).
  //   - `rd_world` is the per-fragment ray from the camera through
  //     this fragment's world-space position (forwarded by the vertex
  //     stage).  Per-pixel reconstruction means the perspective is
  //     correct even though the impostor is rendered onto a flat
  //     billboard quad — the GPU's standard interpolation gives each
  //     fragment its own world coordinates, and the ray-from-camera
  //     calculation respects the engine's actual viewProj.
  //
  // Both vectors are then rotated into the galactic frame and scaled
  // into the shader's "1 unit = MILKY_WAY_RADIUS_MPC" length system,
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

  // Pipeline blend is PURE ADDITIVE (`dstFactor: 'one'`).  Each
  // pixel adds `col × alpha` to the HDR target; dark fragments
  // contribute zero.
  let alpha = u.fadeAlpha;

  // ── NaN / Inf sanitisation ───────────────────────────────────────
  //
  // The ported ShaderToy math has several near-singular operations
  // that can produce NaN at fragments where the camera ray hits
  // edge-case geometry: `pow(si / s.x, 2.5)` divides by `s.x`, the
  // distance to the nearest random star sample, which can land at
  // ≈ 0 for specific cell offsets; `pow(vec3(0.5)*h, exponent)` with
  // h ≈ 0 and a near-zero exponent component is implementation-
  // defined; some `tanh`/`mix`/`clamp` paths propagate any NaN they
  // encounter.  In ADDITIVE blending, even one NaN pixel is fatal —
  // it lands on the HDR target as NaN, the next OVER-blended
  // catalog point reads it back as `dst`, and the multiplication
  // `dst * (1 - src_alpha)` poisons that pixel forever.  Visually
  // the user sees a "black ring" or "black square" tracking the
  // impostor's footprint.
  //
  // WGSL has no `isnan` predicate, but exploits the IEEE-754 rule
  // that NaN is never equal to itself: `x != x` is true iff x is
  // NaN.  We use that to mask each component back to 0 if anything
  // upstream produced a NaN.  Inf is also forced to zero (>1e30
  // catches both +Inf and large-but-finite outliers from
  // `pow(infinity, 2.5)` cases).
  let isFinite = (col == col) & (abs(col) < vec3<f32>(1e30));
  let safeCol = select(vec3<f32>(0.0), col, isFinite);
  return vec4<f32>(safeCol * alpha, alpha);
}

