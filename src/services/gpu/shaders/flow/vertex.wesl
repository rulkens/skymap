// flow/vertex.wesl — screen-space ribbon geometry for the flow-field trails.
//
// Each ring in the 'trail' buffer (filled by compute.wesl) draws as a
// camera-facing ribbon, generated procedurally: instance index selects the
// particle, vertex index walks the ring (two vertices per ring point, one to
// each side), and the ribbon widens perpendicular to its screen-space tangent
// so it reads as a constant-pixel-width streak regardless of depth.
//
// Colour is a cool->warm ramp on the per-sample speed (trail[].w) with a
// quadratic glow at the hot end. Alpha is mode-dependent: advect (mode 0) fades
// over the particle's life and tapers along the trail; streamline (mode 1) is a
// travelling pulse along the static line.
//
// Particles integrate in grid [0,1]^3 (the velocity texture's native space);
// 'cam.model' places that cube in the world and 'cam.mvp' is the view-projection
// (no model). 'intensity' is folded into the colour HERE, not in the fragment,
// so the 'Cam' uniform is referenced only from the vertex stage — the bind-group
// layout then needs Cam at VERTEX visibility only.

import package::flow::constants::TRAIL;
import package::flow::constants::LIFE;
import package::flow::constants::FADE;
import package::flow::constants::SPEED_COLOR_MAX;
import package::flow::io::Cam;
import package::flow::io::VsOut;
import package::lib::flow::rand01;
import package::lib::flow::gridToWorld;
import package::lib::flow::gridToClip;

const COOL = vec3<f32>(0.18, 0.42, 1.0);
const WARM = vec3<f32>(1.0, 0.5, 0.2);
const GLOW: f32 = 0.5;
const PULSE_FLOOR: f32 = 0.12;
const PULSE_SHARPNESS: f32 = 4.0;
const TANGENT_EPS = vec2<f32>(1e-6, 0.0);

@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var<storage, read> trail: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> parts: array<vec4<f32>>;

@vertex
fn vsTrail(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let pIdx = vi / 2u;
  let side = f32(vi % 2u) * 2.0 - 1.0;
  let point = trail[ii*TRAIL + pIdx];
  let clip = cam.mvp * vec4<f32>(gridToWorld(cam.model, point.xyz), 1.0);

  let prevIdx = select(pIdx - 1u, 0u, pIdx == 0u);
  let nextIdx = select(pIdx + 1u, TRAIL - 1u, pIdx + 1u >= TRAIL);
  let clipPrev = gridToClip(cam.mvp, cam.model, trail[ii*TRAIL + prevIdx].xyz);
  let clipNext = gridToClip(cam.mvp, cam.model, trail[ii*TRAIL + nextIdx].xyz);
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

  // Spherical boundary fade. 'point.xyz' in grid [0,1]^3 has spherical radius
  // length(point - 0.5); ribbons ease to 0 over a 'boundaryFadeWidth' band
  // ending at the inscribed sphere (radius 0.5), softening the cube into a
  // sphere. Box-boundary points have a coord at 0 or 1 (radius >= 0.5) so their
  // alpha is 0 there, also masking the respawn pop at the wall. 'min(inner,
  // 0.5 - eps)' keeps the smoothstep edges distinct at width 0 (a hard clip).
  let r = length(point.xyz - vec3<f32>(0.5));
  let inner = min(0.5 - cam.boundaryFadeWidth, 0.5 - 1e-4);
  alpha = alpha * (1.0 - smoothstep(inner, 0.5, r));

  out.alpha = alpha;
  return out;
}
