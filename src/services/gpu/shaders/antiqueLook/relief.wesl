// antiqueLook/relief.wesl — the ground's relief for the plate's shadow hachures, per
// pixel of the engraved body's depth: rg the screen fall line, b a noise pinned to the
// ground (the plate convolves it along that line, `engraving.wesl` `fallLines`), a the
// stroke: > 0 the share of paper a hachure inks, -1..0 a flat's stipple weight, RELIEF_HALO
// paper behind a nearer profile, 0 off the ground (the empty texture reads the same). The normal is the depth's,
// vertically exaggerated, lit by the real Sun on the ground and from orbit by the plate
// light: the Sun's azimuth at a raking elevation, as Hevelius lit his Moon.
//
// | 0 invVp: NDC → eye-relative body-fixed m | 64 vp | 128 eyeFromAnchor, m; 140 orbit |
// | 144 anchorCells (i32); 156 exaggeration | 160 sun; 172 radPerPx | 176 eyeRelBody; 188 unit |
// | 192 res; 200 sin, 204 cos of the plate light's elevation | 208 cellM; 212 slopeInk;   |
// | 216 wideNormal (`AntiqueReliefBody`, per body); 220 reveal (`packAntiqueRelief.ts`) |

import package::antiqueLook::io::VSOut;

struct ReliefUniforms {
  invVp: mat4x4<f32>,
  vp: mat4x4<f32>,
  eyeFromAnchor: vec3<f32>,
  orbit: f32,
  anchorCells: vec3<i32>,
  exaggeration: f32,
  sun: vec3<f32>,
  radPerPx: f32,
  eyeRelBody: vec3<f32>,
  unit: f32,
  res: vec2<f32>,
  lightSin: f32,
  lightCos: f32,
  cellM: f32,
  slopeInk: f32,
  wideNormal: f32,
  reveal: f32,
}

// foreground:0's depth (reversed-Z: 0 is the far clear, so sky).
@group(0) @binding(0) var depthTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> r: ReliefUniforms;

// Mirrors ANTIQUE_RELIEF_ANCHOR_LOG2 (data/rendering/antiqueRelief.ts).
const ANCHOR_LOG2: i32 = 12;
const RELIEF_HALO: f32 = -2.0;
// The normal's stencil, print units: wide enough to smooth the mesh's facets.
const NORMAL_UNITS: f32 = 1.5;
// A paper gap this wide behind every nearer profile, at this relative depth step.
const HALO_UNITS: f32 = 3.0;
const HALO_JUMP: f32 = 0.035;
// The noise's lattice in print units: its convolved streaks come ~2 of these apart.
const NOISE_UNITS: f32 = 1.9;
// Exaggerated slope (radians) over which a face goes from flat (stipple) to steep.
const SLOPE_FLAT: f32 = 0.12;
const SLOPE_STEEP: f32 = 0.5;
// Below this share of the steep slope ground is a flat: stipple, never strokes.
const STROKE_SLOPE: f32 = 0.3;
// Where one height cell (`cellM`) spans this many normal stencils the slope is a mesh
// facet's, not a landform's: no strokes, so the ground at a rover's wheels does not
// streak toward the eye.
const FACET_STENCILS: vec2<f32> = vec2<f32>(4.0, 16.0);
// Real slope (radians) past which a face is no ground the DTM holds (a rover, a lander):
// left to the plate's own body print.
const MESH_SLOPE: f32 = 1.0;
// A `wideNormal` body's stencil spans one height cell on screen, at most this many px;
// a wide tap off the near step's plane by HALO_JUMP has crossed a profile.
const WIDE_MAX_PX: i32 = 48;

fn depthAt(ip: vec2<i32>) -> f32 {
  let size = vec2<i32>(textureDimensions(depthTex));
  return textureLoad(depthTex, clamp(ip, vec2<i32>(0), size - 1), 0).r;
}

fn eyeRel(ip: vec2<i32>, d: f32) -> vec3<f32> {
  let uv = (vec2<f32>(ip) + 0.5) / r.res;
  let h = r.invVp * vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, d, 1.0);
  return h.xyz / h.w;
}

// The difference toward whichever neighbour lies on the same surface: a central
// one across a profile would tilt the normal into whatever lies behind it.
// xyz the position step, w the depth step, both per `o` px.
fn oneSided(ip: vec2<i32>, axis: vec2<i32>, p: vec3<f32>, d: f32) -> vec4<f32> {
  let dm = depthAt(ip - axis);
  let dp = depthAt(ip + axis);
  let plus = dp > 0.0 && (dm <= 0.0 || abs(dp - d) < abs(dm - d));
  if (plus) {
    return vec4<f32>(eyeRel(ip + axis, dp) - p, dp - d);
  }
  return vec4<f32>(p - eyeRel(ip - axis, dm), d - dm);
}

// `oneSided` over `base` px, or over `wide` where the wider taps still lie on the near
// step's plane, rescaled to `base` px so the callers' units hold.
fn surfaceStep(ip: vec2<i32>, axis: vec2<i32>, base: i32, wide: i32, p: vec3<f32>, d: f32) -> vec4<f32> {
  let near = oneSided(ip, axis * base, p, d);
  if (wide <= base) {
    return near;
  }
  let far = oneSided(ip, axis * wide, p, d);
  let k = f32(base) / f32(wide);
  return select(near, far * k, abs(far.w * k - near.w) < HALO_JUMP * d * k);
}

fn pcg3(c: vec3<i32>) -> f32 {
  var v = vec3<u32>(c) * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> vec3<u32>(16u);
  v.x += v.y * v.z;
  return f32(v.x) * (2.0 / 4294967295.0) - 1.0;
}

// Value noise on a 2^j m lattice, its cells counted from the body's centre: the
// anchor's whole cells come in as integers, so f32 only carries the remainder.
fn groundNoise(q: vec3<f32>, j: i32) -> f32 {
  let g = q / exp2(f32(j));
  let c = floor(g);
  let f = g - c;
  let s = f * f * (3.0 - 2.0 * f);
  let base = vec3<i32>(c) + r.anchorCells * (1i << u32(ANCHOR_LOG2 - j));
  let x00 = mix(pcg3(base), pcg3(base + vec3<i32>(1, 0, 0)), s.x);
  let x10 = mix(pcg3(base + vec3<i32>(0, 1, 0)), pcg3(base + vec3<i32>(1, 1, 0)), s.x);
  let x01 = mix(pcg3(base + vec3<i32>(0, 0, 1)), pcg3(base + vec3<i32>(1, 0, 1)), s.x);
  let x11 = mix(pcg3(base + vec3<i32>(0, 1, 1)), pcg3(base + vec3<i32>(1, 1, 1)), s.x);
  return mix(mix(x00, x10, s.y), mix(x01, x11, s.y), s.z);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let ip = vec2<i32>(in.pos.xy);
  let d = depthAt(ip);
  if (d <= 0.0) {
    return vec4<f32>(0.0);
  }
  let p = eyeRel(ip, d);
  let t = length(p);
  let o = max(i32(round(NORMAL_UNITS * r.unit)), 1);
  let cellPx = r.cellM / (t * r.radPerPx);
  let wide = select(o, clamp(i32(round(cellPx)), o, max(o, WIDE_MAX_PX)), r.wideNormal > 0.5);
  let sx = surfaceStep(ip, vec2<i32>(1, 0), o, wide, p, d);
  let sy = surfaceStep(ip, vec2<i32>(0, 1), o, wide, p, d);
  var n = normalize(cross(sx.xyz, sy.xyz));
  n = select(n, -n, dot(n, p) > 0.0);
  let up = normalize(r.eyeRelBody + p);
  let nu = dot(n, up);
  if (nu < cos(MESH_SLOPE)) {
    return vec4<f32>(0.0);
  }
  let nex = normalize(r.exaggeration * (n - nu * up) / max(nu, 0.2) + up);

  // Shade against how flat ground there is lit, so a plain prints as paper.
  let sunFlat = r.sun - dot(r.sun, up) * up;
  let azimuth = sunFlat / max(length(sunFlat), 1e-6);
  let l = normalize(mix(r.sun, r.lightCos * azimuth + r.lightSin * up, r.orbit));
  let dark = clamp(1.0 - max(dot(nex, l), 0.0) / max(dot(up, l), 0.05), 0.0, 1.0);
  let slope = smoothstep(SLOPE_FLAT, SLOPE_STEEP, atan2(length(cross(nex, up)), dot(nex, up)));
  let tone = pow(min(dark * 1.1, 1.0), 1.4) * max(slope, 0.35);
  // Imhof's aerial perspective: lighter and finer with range over the eye's height there.
  let near = clamp(log(30.0 * max(-dot(p, up), 1e-3) / t) / log(30.0), 0.0, 1.0);
  let fade = 0.45 + 0.55 * near;
  let cellStencils = cellPx / f32(wide);
  let landform = slope > STROKE_SLOPE && cellStencils < FACET_STENCILS.y;
  let stroke = select(0.0, ((0.05 + 0.16 * slope) * r.slopeInk + 0.6 * tone) * fade
    * (1.0 - smoothstep(FACET_STENCILS.x, FACET_STENCILS.y, cellStencils)), landform);

  // Paper behind a nearer profile: a tap nearer (deeper reversed-Z) than this
  // surface's own plane would put it.
  let halo = HALO_UNITS * r.unit;
  var behind = false;
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.7853982;
    let off = vec2<f32>(cos(a), sin(a)) * halo;
    let plane = d + (sx.w * off.x + sy.w * off.y) / f32(o);
    behind = behind || depthAt(ip + vec2<i32>(round(off))) > max(plane, d) * (1.0 + HALO_JUMP);
  }
  if (behind) {
    return vec4<f32>(0.0, 0.0, 0.0, RELIEF_HALO);
  }

  // The fall line on screen: downhill on the ground, projected a short step.
  let downhill = n - nu * up;
  var fall = vec2<f32>(0.0);
  if (length(downhill) > 1e-5) {
    let c0 = r.vp * vec4<f32>(p, 1.0);
    let c1 = r.vp * vec4<f32>(p + normalize(downhill) * (0.01 * t), 1.0);
    let step = (c1.xy / c1.w - c0.xy / c0.w) * vec2<f32>(r.res.x, -r.res.y);
    fall = step / max(length(step), 1e-12);
  }

  // Two lattice octaves round NOISE_UNITS of screen, blended at constant contrast.
  let jf = log2(t * r.radPerPx * NOISE_UNITS * r.unit);
  let j0 = clamp(i32(floor(jf)), -6, ANCHOR_LOG2 - 1);
  let w = clamp(jf - f32(j0), 0.0, 1.0);
  let q = r.eyeFromAnchor + p;
  let noise = (groundNoise(q, j0) * (1.0 - w) + groundNoise(q, j0 + 1) * w) / sqrt((1.0 - w) * (1.0 - w) + w * w);
  // Hachures fade in as a body's far relief signs fade out (`revealDetail`).
  return vec4<f32>(fall, noise, select(-fade, stroke * r.reveal, stroke > 0.0));
}
