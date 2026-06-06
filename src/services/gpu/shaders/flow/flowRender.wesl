// flowRender.wesl — screen-space ribbon rendering of the flow-field trails.
//
// The render half of the flow-field visualization, ported from the standalone
// 'cosmic-flow' spike. The compute pass ('flowCompute.wesl') fills a per-particle
// ring buffer 'trail' with (xyz, speed) samples; this pass draws each ring as a
// camera-facing ribbon. The geometry is generated procedurally: instance index
// selects the particle, vertex index walks the ring (two vertices per ring
// point, one to each side), and the ribbon is widened perpendicular to its
// screen-space tangent so it reads as a constant-pixel-width streak regardless
// of depth.
//
// Colour comes from the per-sample speed (stored in trail[].w): a cool->warm
// ramp with a quadratic glow boost at the hot end. Alpha differs by mode:
//   - advect (mode 0): fades in/out over the particle's life and tapers along
//     the trail so the head is brightest.
//   - streamline (mode 1): a travelling pulse along the static streamline.
//
// DELIBERATE CHANGE 1 — the model matrix. The spike baked a fixed [-1,1] cube
// via 'gridToWorld(voxel) = (voxel - 0.5) * 2.0'. In the main engine the flow
// volume is placed and scaled by the camera/engine, so we map the grid [0,1]^3
// to world through a 'model' matrix carried on the 'Cam' uniform:
// 'gridToWorld(voxel) = (cam.model * vec4(voxel, 1)).xyz'. 'cam.mvp' is the full
// view-projection (it does NOT include model), so clip space is
// 'cam.mvp * (cam.model * vec4(voxel, 1))'. The COMPUTE shader is unchanged —
// particles still integrate in grid [0,1]^3, the velocity texture's native
// space; only this render pass needs to place the cube in the world.
//
// DELIBERATE CHANGE 2 — the 'intensity' brightness knob. There was no exposure
// or tonemap stage in the spike to preserve, so the fragment stays purely
// additive ('col * alpha'). We add a pre-blend brightness multiplier 'intensity'
// on the 'Cam' uniform and fold it into the emitted colour IN THE VERTEX STAGE:
// 'out.col = (ramp + glow) * cam.intensity'. Because the fragment emits
// 'col * alpha' into an additive blend, scaling 'col' scales the additive RGB
// brightness exactly as intended.
//
// WHY fold intensity in the vertex stage rather than the fragment: it keeps the
// 'cam' uniform referenced ONLY from the vertex stage. That is load-bearing for
// the bind-group-layout task — the layout does NOT need to grant the 'Cam'
// binding FRAGMENT visibility, only VERTEX. The fragment 'fsTrail' touches
// nothing but its interpolated inputs.
//
// Cam uniform byte layout (TS pads the buffer to 160 — see the flow renderer's
// uniform docblock):
//   mvp               mat4x4<f32> @ 0    (64 bytes)
//   model             mat4x4<f32> @ 64   (64 bytes)
//   width             f32         @ 128
//   aspect            f32         @ 132
//   phase             f32         @ 136
//   mode              u32         @ 140
//   intensity         f32         @ 144
//   boundaryFadeWidth f32         @ 148

import package::flow::flowConstants::TRAIL;
import package::flow::flowConstants::LIFE;
import package::flow::flowConstants::FADE;
import package::flow::flowConstants::SPEED_COLOR_MAX;

const COOL = vec3<f32>(0.18, 0.42, 1.0);
const WARM = vec3<f32>(1.0, 0.5, 0.2);
const GLOW: f32 = 0.5;
const PULSE_FLOOR: f32 = 0.12;
const PULSE_SHARPNESS: f32 = 4.0;
const TANGENT_EPS = vec2<f32>(1e-6, 0.0);

struct Cam { mvp: mat4x4<f32>, model: mat4x4<f32>, width: f32, aspect: f32, phase: f32, mode: u32, intensity: f32, boundaryFadeWidth: f32 };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var<storage, read> trail: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> parts: array<vec4<f32>>;

fn rand01(n:u32)->f32 { var s=n*747796405u+2891336453u; let w=((s>>((s>>28u)+4u))^s)*277803737u; return f32((w>>22u)^w)/4294967295.0; }

fn gridToWorld(voxel: vec3<f32>) -> vec3<f32> { return (cam.model * vec4<f32>(voxel, 1.0)).xyz; }
fn gridToClip(ii: u32, pIdx: u32) -> vec4<f32> { return cam.mvp * vec4<f32>(gridToWorld(trail[ii*TRAIL + pIdx].xyz), 1.0); }

struct VsOut { @builtin(position) pos: vec4<f32>, @location(0) col: vec3<f32>, @location(1) alpha: f32 };

@vertex
fn vsTrail(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let pIdx = vi / 2u;
  let side = f32(vi % 2u) * 2.0 - 1.0;
  let point = trail[ii*TRAIL + pIdx];
  let clip = cam.mvp * vec4<f32>(gridToWorld(point.xyz), 1.0);

  let prevIdx = select(pIdx - 1u, 0u, pIdx == 0u);
  let nextIdx = select(pIdx + 1u, TRAIL - 1u, pIdx + 1u >= TRAIL);
  let clipPrev = gridToClip(ii, prevIdx);
  let clipNext = gridToClip(ii, nextIdx);
  var ndcPrev = clipPrev.xy / clipPrev.w;
  var ndcNext = clipNext.xy / clipNext.w;
  ndcPrev.x *= cam.aspect; ndcNext.x *= cam.aspect;
  let tangent = normalize(ndcNext - ndcPrev + TANGENT_EPS);
  var perp = vec2<f32>(-tangent.y, tangent.x) * cam.width;
  perp.x /= cam.aspect;
  var out: VsOut;
  out.pos = vec4<f32>(clip.x + side*perp.x*clip.w, clip.y + side*perp.y*clip.w, clip.z, clip.w);

  let speedT = clamp(point.w / SPEED_COLOR_MAX, 0.0, 1.0);
  out.col = (mix(COOL, WARM, speedT) + vec3<f32>(speedT*speedT*GLOW)) * cam.intensity;

  let along = f32(pIdx) / f32(TRAIL - 1u);
  var alpha: f32;
  if (cam.mode == 0u) {
    let age = parts[ii].w;
    let life = clamp(age / FADE, 0.0, 1.0) * clamp((LIFE - age) / FADE, 0.0, 1.0);
    alpha = along * life;
  } else {
    let pulse = pow(fract(along - cam.phase + rand01(ii)), PULSE_SHARPNESS);
    alpha = (PULSE_FLOOR + pulse) * smoothstep(0.0, PULSE_FLOOR, along);
  }

  // Spherical boundary fade. 'point.xyz' is the trail sample in grid [0,1]^3,
  // so its distance from the cube centre (0.5) is the spherical radius. Ribbons
  // ease to 0 over a 'boundaryFadeWidth' band ending at the cube-inscribed
  // sphere (radius 0.5), softening the cube faces/corners into a sphere. Every
  // box-boundary point has a coord at 0 or 1, hence radius >= 0.5, so its alpha
  // is 0 there — which also masks the particle respawn pop at the wall.
  // 'min(inner, 0.5 - eps)' keeps the two smoothstep edges distinct when the
  // width is 0 (no division by zero); width 0 then reads as a hard sphere clip.
  let r = length(point.xyz - vec3<f32>(0.5));
  let inner = min(0.5 - cam.boundaryFadeWidth, 0.5 - 1e-4);
  alpha = alpha * (1.0 - smoothstep(inner, 0.5, r));

  out.alpha = alpha;
  return out;
}

@fragment
fn fsTrail(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(i.col * i.alpha, i.alpha);
}
