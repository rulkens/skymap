// antiqueLook/passes/reliefFragment.wesl — the ground's relief for the plate's shadow hachures, per
// pixel of the engraved body's depth: rg the screen fall line, b a noise pinned to the
// ground (the plate convolves it along that line, `engraving.wesl` `fallLines`), a the
// stroke: > 0 a hachure's weight (per `slopeInk`, the slope or the shade's share), -1..0
// a flat's stipple weight, RELIEF_HALO paper behind a nearer profile, 0 off the ground
// (the empty texture reads the same). The normal is the depth's, vertically exaggerated,
// lit by the real Sun on the ground and from orbit by the plate light: the Sun's azimuth
// at a raking elevation, as Hevelius lit his Moon.
//
// | 0 invVp: NDC → eye-relative body-fixed m | 64 vp | 128 eyeFromAnchor, m; 140 orbit |
// | 144 anchorCells (i32); 156 exaggeration | 160 sun; 172 radPerPx | 176 eyeRelBody; 188 unit |
// | 192 res; 200 sin, 204 cos of the plate light's elevation | 208 cellM; 212 slopeInk;   |
// | 216 wideNormal (`AntiqueReliefBody`, per body); 220 reveal (`packAntiqueRelief.ts`) |
// | 224 heightPeriodM: > 0, b holds the height phase over it instead of the noise          |
// |     (`AntiqueReliefBody.contourPeriodM`)                                               |

import package::antiqueLook::io::VSOut;
import package::antiqueLook::shared::groundNoise::groundNoiseAt;

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
  heightPeriodM: f32,
}

// foreground:0's depth (reversed-Z: 0 is the far clear, so sky).
@group(0) @binding(0) var depthTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> r: ReliefUniforms;

const RELIEF_HALO: f32 = -2.0;
// The normal's stencil, print units: wide enough to smooth the mesh's facets.
const NORMAL_UNITS: f32 = 1.5;
// A paper gap this wide behind every nearer profile, at this relative depth step.
const HALO_UNITS: f32 = 3.0;
const HALO_JUMP: f32 = 0.035;
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
// A body its plain render inks (`slopeInk`) trusts its depth for form only past this slope
// share and below orbit, where the mesh is km facets; elsewhere its ground is a flat,
// hatched along the plate's light angle (owner ruling: the light sets the direction).
const TRUSTED_SLOPE: f32 = 0.6;

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

// A step `v` (eye-relative m) from `p`, as a unit screen direction in px.
fn screenDir(p: vec3<f32>, v: vec3<f32>) -> vec2<f32> {
  let c0 = r.vp * vec4<f32>(p, 1.0);
  let c1 = r.vp * vec4<f32>(p + v, 1.0);
  let step = (c1.xy / c1.w - c0.xy / c0.w) * vec2<f32>(r.res.x, -r.res.y);
  return step / max(length(step), 1e-12);
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
  // A coarse-mesh body's steep facets are its terrain's cliffs, not a lander.
  if (nu < cos(MESH_SLOPE) && r.wideNormal < 0.5) {
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
  let trusted = r.slopeInk < 0.5 || (slope > TRUSTED_SLOPE && r.orbit < 0.5);
  let landform = slope > STROKE_SLOPE && cellStencils < FACET_STENCILS.y && trusted;
  let stroke = select(0.0, mix(0.6 * tone, slope, r.slopeInk) * fade
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
    fall = screenDir(p, normalize(downhill) * (0.01 * t));
  }

  let noise = groundNoiseAt(r.eyeFromAnchor + p, r.anchorCells, t * r.radPerPx * r.unit);
  // A contour body's radius over its period, whose fraction `isoLines` cuts at power-of-two
  // steps, so a whole period wraps onto every step.
  let hb = select(noise, fract(length(r.eyeRelBody + p) / r.heightPeriodM), r.heightPeriodM > 0.0);
  // Hachures fade in as a body's far relief signs fade out (`revealDetail`).
  return vec4<f32>(fall, hb, select(-fade, stroke * r.reveal, stroke > 0.0));
}
