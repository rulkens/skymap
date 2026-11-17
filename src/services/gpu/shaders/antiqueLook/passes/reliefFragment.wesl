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
// | 232 rangeGateM: low, high m of 80 km relief; high 0 = ungated (`rangeGate`)            |

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
  rangeGateM: vec2<f32>,
}

// foreground:0's depth (reversed-Z: 0 is the far clear, so sky).
@group(0) @binding(0) var depthTex: texture_2d<f32>;
@group(0) @binding(1) var<uniform> uniforms: ReliefUniforms;
// Earth's 80 km relief, grey = metres / RANGE_RELIEF_STEP_M, equirectangular (`bakeRangeRelief.ts`);
// 1 px while it loads, which reads as ungated.
@group(0) @binding(2) var rangeTex: texture_2d<f32>;

const RELIEF_HALO: f32 = -2.0;
const RANGE_RELIEF_STEP_M: f32 = 16.0;
const PI: f32 = 3.14159265;
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

fn depthAt(texelPos: vec2<i32>) -> f32 {
  let size = vec2<i32>(textureDimensions(depthTex));
  return textureLoad(depthTex, clamp(texelPos, vec2<i32>(0), size - 1), 0).r;
}

// 0 on hill country, 1 inside a range, over the body's relief ramp: bilinear over the map's
// pixels, wrapping at the antimeridian. `pos` is body-fixed, lon east of +x, lat up +z.
fn rangeGate(pos: vec3<f32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(rangeTex));
  if (uniforms.rangeGateM.y <= 0.0 || dims.x < 2) {
    return 1.0;
  }
  let lon = atan2(pos.y, pos.x);
  let lat = asin(clamp(pos.z / length(pos), -1.0, 1.0));
  let mapPos = vec2<f32>(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI) * vec2<f32>(dims) - 0.5;
  let base = vec2<i32>(floor(mapPos));
  let blend = fract(mapPos);
  var relief = 0.0;
  for (var tapIndex = 0; tapIndex < 4; tapIndex++) {
    let tapOffset = vec2<i32>(tapIndex & 1, tapIndex >> 1u);
    let tapPos = base + tapOffset;
    let heightTap = textureLoad(rangeTex, vec2<i32>((tapPos.x + dims.x) % dims.x, clamp(tapPos.y, 0, dims.y - 1)), 0).r;
    relief += heightTap * select(1.0 - blend.x, blend.x, tapOffset.x == 1) * select(1.0 - blend.y, blend.y, tapOffset.y == 1);
  }
  return smoothstep(uniforms.rangeGateM.x, uniforms.rangeGateM.y, relief * 255.0 * RANGE_RELIEF_STEP_M);
}

fn eyeRel(texelPos: vec2<i32>, depth: f32) -> vec3<f32> {
  let uv = (vec2<f32>(texelPos) + 0.5) / uniforms.res;
  let clip = uniforms.invVp * vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
  return clip.xyz / clip.w;
}

// The difference toward whichever neighbour lies on the same surface: a central
// one across a profile would tilt the normal into whatever lies behind it.
// xyz the position step, w the depth step, both per `stencilPx` px.
fn oneSided(texelPos: vec2<i32>, axis: vec2<i32>, position: vec3<f32>, depth: f32) -> vec4<f32> {
  let depthMinus = depthAt(texelPos - axis);
  let depthPlus = depthAt(texelPos + axis);
  let plus = depthPlus > 0.0 && (depthMinus <= 0.0 || abs(depthPlus - depth) < abs(depthMinus - depth));
  if (plus) {
    return vec4<f32>(eyeRel(texelPos + axis, depthPlus) - position, depthPlus - depth);
  }
  return vec4<f32>(position - eyeRel(texelPos - axis, depthMinus), depth - depthMinus);
}

// `oneSided` over `base` px, or over `wide` where the wider taps still lie on the near
// step's plane, rescaled to `base` px so the callers' units hold.
fn surfaceStep(texelPos: vec2<i32>, axis: vec2<i32>, base: i32, wide: i32, position: vec3<f32>, depth: f32) -> vec4<f32> {
  let near = oneSided(texelPos, axis * base, position, depth);
  if (wide <= base) {
    return near;
  }
  let far = oneSided(texelPos, axis * wide, position, depth);
  let scale = f32(base) / f32(wide);
  return select(near, far * scale, abs(far.w * scale - near.w) < HALO_JUMP * depth * scale);
}

// A step `v` (eye-relative m) from `p`, as a unit screen direction in px.
fn screenDir(position: vec3<f32>, offset: vec3<f32>) -> vec2<f32> {
  let clipFrom = uniforms.vp * vec4<f32>(position, 1.0);
  let clipTo = uniforms.vp * vec4<f32>(position + offset, 1.0);
  let step = (clipTo.xy / clipTo.w - clipFrom.xy / clipFrom.w) * vec2<f32>(uniforms.res.x, -uniforms.res.y);
  return step / max(length(step), 1e-12);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let texelPos = vec2<i32>(in.pos.xy);
  let depth = depthAt(texelPos);
  if (depth <= 0.0) {
    return vec4<f32>(0.0);
  }
  let position = eyeRel(texelPos, depth);
  let eyeDist = length(position);
  let stencilPx = max(i32(round(NORMAL_UNITS * uniforms.unit)), 1);
  let cellPx = uniforms.cellM / (eyeDist * uniforms.radPerPx);
  let wide = select(stencilPx, clamp(i32(round(cellPx)), stencilPx, max(stencilPx, WIDE_MAX_PX)), uniforms.wideNormal > 0.5);
  let stepX = surfaceStep(texelPos, vec2<i32>(1, 0), stencilPx, wide, position, depth);
  let stepY = surfaceStep(texelPos, vec2<i32>(0, 1), stencilPx, wide, position, depth);
  var normal = normalize(cross(stepX.xyz, stepY.xyz));
  normal = select(normal, -normal, dot(normal, position) > 0.0);
  let up = normalize(uniforms.eyeRelBody + position);
  let upCos = dot(normal, up);
  // A coarse-mesh body's steep facets are its terrain's cliffs, not a lander.
  if (upCos < cos(MESH_SLOPE) && uniforms.wideNormal < 0.5) {
    return vec4<f32>(0.0);
  }
  let exaggerated = normalize(uniforms.exaggeration * (normal - upCos * up) / max(upCos, 0.2) + up);

  // Shade against how flat ground there is lit, so a plain prints as paper.
  let sunFlat = uniforms.sun - dot(uniforms.sun, up) * up;
  let azimuth = sunFlat / max(length(sunFlat), 1e-6);
  let lightDir = normalize(mix(uniforms.sun, uniforms.lightCos * azimuth + uniforms.lightSin * up, uniforms.orbit));
  let dark = clamp(1.0 - max(dot(exaggerated, lightDir), 0.0) / max(dot(up, lightDir), 0.05), 0.0, 1.0);
  let slope = smoothstep(SLOPE_FLAT, SLOPE_STEEP, atan2(length(cross(exaggerated, up)), dot(exaggerated, up)));
  let tone = pow(min(dark * 1.1, 1.0), 1.4) * max(slope, 0.35);
  // Imhof's aerial perspective: lighter and finer with range over the eye's height there.
  let near = clamp(log(30.0 * max(-dot(position, up), 1e-3) / eyeDist) / log(30.0), 0.0, 1.0);
  let fade = 0.45 + 0.55 * near;
  let cellStencils = cellPx / f32(wide);
  let trusted = uniforms.slopeInk < 0.5 || (slope > TRUSTED_SLOPE && uniforms.orbit < 0.5);
  let landform = slope > STROKE_SLOPE && cellStencils < FACET_STENCILS.y && trusted;
  let stroke = select(0.0, mix(0.6 * tone, slope, uniforms.slopeInk) * fade
    * (1.0 - smoothstep(FACET_STENCILS.x, FACET_STENCILS.y, cellStencils)), landform);

  // Paper behind a nearer profile: a tap nearer (deeper reversed-Z) than this
  // surface's own plane would put it.
  let halo = HALO_UNITS * uniforms.unit;
  var behind = false;
  for (var tapIndex = 0; tapIndex < 8; tapIndex++) {
    let angle = f32(tapIndex) * 0.7853982;
    let off = vec2<f32>(cos(angle), sin(angle)) * halo;
    let plane = depth + (stepX.w * off.x + stepY.w * off.y) / f32(stencilPx);
    behind = behind || depthAt(texelPos + vec2<i32>(round(off))) > max(plane, depth) * (1.0 + HALO_JUMP);
  }
  if (behind) {
    return vec4<f32>(0.0, 0.0, 0.0, RELIEF_HALO);
  }

  // The fall line on screen: downhill on the ground, projected a short step.
  let downhill = normal - upCos * up;
  var fall = vec2<f32>(0.0);
  if (length(downhill) > 1e-5) {
    fall = screenDir(position, normalize(downhill) * (0.01 * eyeDist));
  }

  let noise = groundNoiseAt(uniforms.eyeFromAnchor + position, uniforms.anchorCells, eyeDist * uniforms.radPerPx * uniforms.unit);
  // A contour body's radius over its period, whose fraction `isoLines` cuts at power-of-two
  // steps, so a whole period wraps onto every step.
  let heightOrNoise = select(noise, fract(length(uniforms.eyeRelBody + position) / uniforms.heightPeriodM), uniforms.heightPeriodM > 0.0);
  // Hachures fade in as a body's far relief signs fade out (`revealDetail`).
  return vec4<f32>(fall, heightOrNoise, select(-fade, stroke * uniforms.reveal * rangeGate(uniforms.eyeRelBody + position), stroke > 0.0));
}
