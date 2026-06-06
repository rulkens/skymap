// flowRender.wesl — the trail-ribbon render module (vsTrail / fsTrail).
//
// Each particle is drawn as a triangle-strip ribbon threaded through its TRAIL
// ring points, widened perpendicular to the screen-space tangent so 'size'
// (cam.width) controls thickness. Colour comes from speed (a cool->warm ramp
// plus a high-speed glow); alpha differs by mode:
//   - advect (mode 0): a faint tail that fades along the trail, gated by a
//     birth/death envelope from the particle age.
//   - streamline (mode 1): a static line carrying a travelling pulse driven by
//     cam.phase, with a per-line random offset so pulses don't sync.
//
// TRAIL / LIFE / FADE / SPEED_COLOR_MAX are imported from 'flowConstants' (the
// WESL mirror of constants.ts); the render-only tuning constants (COOL, WARM,
// GLOW, PULSE_FLOOR, PULSE_SHARPNESS, TANGENT_EPS) stay inline because they
// shape this pass only. WGSL identifier references in comments use single
// quotes (a backtick breaks the wesl-plugin parser).
//
// Render uniform 'Cam' byte layout (buffer is 80 bytes):
//   mvp    mat4x4<f32> @ 0   (64 bytes)
//   width  f32         @ 64
//   aspect f32         @ 68
//   phase  f32         @ 72
//   mode   u32         @ 76

import package::visualizations::flowField::shaders::flowConstants::TRAIL;
import package::visualizations::flowField::shaders::flowConstants::LIFE;
import package::visualizations::flowField::shaders::flowConstants::FADE;
import package::visualizations::flowField::shaders::flowConstants::SPEED_COLOR_MAX;

const COOL = vec3<f32>(0.18, 0.42, 1.0);            // colour at low speed
const WARM = vec3<f32>(1.0, 0.5, 0.2);              // colour at high speed
const GLOW: f32 = 0.5;                              // extra additive brightness toward high speed
const PULSE_FLOOR: f32 = 0.12;                      // streamline brightness between pulses
const PULSE_SHARPNESS: f32 = 4.0;                   // higher = tighter travelling pulse
const TANGENT_EPS = vec2<f32>(1e-6, 0.0);           // guards normalize() of a zero screen tangent

struct Cam { mvp: mat4x4<f32>, width: f32, aspect: f32, phase: f32, mode: u32 };
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var<storage, read> trail: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> parts: array<vec4<f32>>;

fn rand01(n:u32)->f32 { var s=n*747796405u+2891336453u; let w=((s>>((s>>28u)+4u))^s)*277803737u; return f32((w>>22u)^w)/4294967295.0; }

// [0,1] grid space -> centred [-1,1] world cube, then its clip-space position
fn gridToWorld(voxel: vec3<f32>) -> vec3<f32> { return (voxel - vec3<f32>(0.5)) * 2.0; }
fn gridToClip(ii: u32, pIdx: u32) -> vec4<f32> { return cam.mvp * vec4<f32>(gridToWorld(trail[ii*TRAIL + pIdx].xyz), 1.0); }

struct VsOut { @builtin(position) pos: vec4<f32>, @location(0) col: vec3<f32>, @location(1) alpha: f32 };

// Each particle is a triangle-strip ribbon through its TRAIL points, widened
// perpendicular to the screen-space tangent so cam.width controls thickness.
// World-space, so the curved trail rotates with the cube.
@vertex
fn vsTrail(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let pIdx = vi / 2u;                              // which trail point this vertex sits on
  let side = f32(vi % 2u) * 2.0 - 1.0;            // -1 / +1 ribbon edge
  let point = trail[ii*TRAIL + pIdx];
  let clip = cam.mvp * vec4<f32>(gridToWorld(point.xyz), 1.0);

  // central-difference tangent in aspect-corrected NDC, then a screen-perpendicular offset
  let prevIdx = select(pIdx - 1u, 0u, pIdx == 0u);
  let nextIdx = select(pIdx + 1u, TRAIL - 1u, pIdx + 1u >= TRAIL);
  let clipPrev = gridToClip(ii, prevIdx);
  let clipNext = gridToClip(ii, nextIdx);
  var ndcPrev = clipPrev.xy / clipPrev.w;
  var ndcNext = clipNext.xy / clipNext.w;
  ndcPrev.x *= cam.aspect; ndcNext.x *= cam.aspect;
  let tangent = normalize(ndcNext - ndcPrev + TANGENT_EPS);
  var perp = vec2<f32>(-tangent.y, tangent.x) * cam.width;
  perp.x /= cam.aspect;                            // back to clip space
  var out: VsOut;
  out.pos = vec4<f32>(clip.x + side*perp.x*clip.w, clip.y + side*perp.y*clip.w, clip.z, clip.w);

  let speedT = clamp(point.w / SPEED_COLOR_MAX, 0.0, 1.0);
  out.col = mix(COOL, WARM, speedT) + vec3<f32>(speedT*speedT*GLOW);

  let along = f32(pIdx) / f32(TRAIL - 1u);         // 0..1 along the trail (advect head at 1)
  var alpha: f32;
  if (cam.mode == 0u) {                            // advect: faint tail + birth/death fade
    let age = parts[ii].w;
    let life = clamp(age / FADE, 0.0, 1.0) * clamp((LIFE - age) / FADE, 0.0, 1.0);
    alpha = along * life;
  } else {                                         // streamlines: static line + travelling pulse
    let pulse = pow(fract(along - cam.phase + rand01(ii)), PULSE_SHARPNESS);
    alpha = (PULSE_FLOOR + pulse) * smoothstep(0.0, PULSE_FLOOR, along);
  }
  out.alpha = alpha;
  return out;
}

@fragment
fn fsTrail(i: VsOut) -> @location(0) vec4<f32> {
  return vec4<f32>(i.col * i.alpha, i.alpha);
}
