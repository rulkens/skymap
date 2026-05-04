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
  // mat4 viewProj — UNUSED in this pass (the quad is emitted directly
  // in clip-space) but kept in the struct for ABI symmetry with the
  // other GPU passes; the renderer module writes it anyway from the
  // shared per-frame snapshot.
  viewProj: mat4x4<f32>,
  // viewport (px) — UNUSED in this pass for the same reason.  Kept
  // for ABI symmetry.
  viewport: vec2<f32>,
  // Distance-fade alpha pre-computed on the CPU
  // (`utils/math/milkyWayFade.ts`).  Multiplied into the fragment's
  // emissive output and into alpha for premultiplied blend.
  fadeAlpha: f32,
  // iTime in seconds, scaled by 0.25 on the CPU before upload so the
  // ShaderToy's internal `TIME = iTime*0.1` works out to a slow,
  // alive-but-not-spinning rotation.
  iTime: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) uv: vec2<f32>,  // [-1.05, 1.05]²
};

// Emit a clip-space quad that covers the full viewport plus a 5% bleed.
// Six vertices, one triangle-list quad.  The 5% bleed exists so the
// fragment stage's edge fade can come down to zero alpha before the
// quad's hard edge — without it, you'd see a sharp rectangular cut
// against the cleared HDR target.
const CORNERS = array<vec2<f32>, 6>(
  vec2<f32>(-1.05, -1.05),
  vec2<f32>( 1.05, -1.05),
  vec2<f32>( 1.05,  1.05),
  vec2<f32>(-1.05, -1.05),
  vec2<f32>( 1.05,  1.05),
  vec2<f32>(-1.05,  1.05),
);

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> VsOut {
  let c = CORNERS[vid];
  var out: VsOut;
  // Clip-space directly — w=1 so the quad sits at the near plane and
  // never gets occluded by the depth buffer.  Note we DON'T use the
  // viewProj matrix; the impostor is conceptually a screen-space
  // backdrop, like a skybox layer, not a 3D object.
  out.clipPos = vec4<f32>(c, 0.0, 1.0);
  out.uv = c;
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
  let p = rot(p_in, 0.5 * tm);

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

  return col;
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
  let p = in.uv;

  // Camera: hard-coded from the original ShaderToy.  This is the
  // vantage point the artist chose for the most aesthetically pleasing
  // framing of the spiral, and it's deliberately fixed regardless of
  // the user's actual orbit camera — the impostor is a 2D backdrop,
  // not a 3D scene the engine's camera can fly through.  See the
  // header comment for the screen-aligned-vs-world-fixed trade.
  let ro = vec3<f32>(0.0, 0.7, 2.0) * 0.75;
  let la = vec3<f32>(0.0, 0.0, 0.0);
  let up = vec3<f32>(-0.5, 1.0, 0.0);
  let ww = normalize(la - ro);
  let uu = normalize(cross(up, ww));
  let vv = normalize(cross(ww, uu));
  let rd = normalize(p.x * uu + p.y * vv + 2.5 * ww);

  let col = renderGalaxy(ro, rd, tm);

  // Smooth edge fade: the bleed margin runs from radius 1.0 to 1.05.
  // Inside the unit square (radius ≤ 1.0 in either component) we're at
  // full alpha; from 1.0 to ~1.05 we fade to zero so there's no hard
  // rectangular edge against the cleared HDR background.
  //
  // We use the L∞ norm here (max of |x|, |y|) because the visual
  // structure of the galaxy is bounded inside the unit square in this
  // shader — a circular fade would crop the diagonal extents.
  let r = max(abs(in.uv.x), abs(in.uv.y));
  let edgeFade = 1.0 - smoothstep(1.0, 1.05, r);

  // Final alpha is the per-frame distance-fade (CPU-computed from
  // camera distance to origin) times the per-pixel edge fade.
  let alpha = u.fadeAlpha * edgeFade;

  // Output LINEAR HDR colour with premultiplied alpha to match the
  // engine's other passes.  No postProcess() — the engine's downstream
  // tone-map pass handles gamma + curve + exposure + sRGB conversion.
  return vec4<f32>(col * alpha, alpha);
}
