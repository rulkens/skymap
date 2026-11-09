// stellarStreams/streaks/vertex.wesl — the streak look. Each stream particle is a screen-space
// billboard: a Gaussian smeared along its projected orbital tangent and drifting along
// it, so a stream reads as flowing debris rather than dots. Surface brightness is held
// constant while resolved; below 'minPx' the sprite clamps and dims by area, so
// distant streams stay smooth haze instead of aliasing sparkle. Picking is the
// centreline ribbons' (stellarStreams/ribbonPick/), not these quads.

import package::stellarStreams::streaks::io::Uniforms;
import package::stellarStreams::streaks::io::VSOut;
import package::stellarStreams::streaks::io::STREAK_HALF_ACROSS_RADII;
import package::lib::camera::worldToClip;
import package::lib::flow::rand01;
import package::lib::starTint::starTint;

@group(0) @binding(0) var<uniform> u: Uniforms;

// attr.z is Gaia BP−RP mapped linearly onto 0..1 over this span (STREAM_BP_RP_RANGE in TS).
const STREAM_BP_RP_RANGE: vec2<f32> = vec2<f32>(-0.3, 2.2);
// 'flow' is kpc travelled per 8 s loop, so drift speed is physical, not sprite-sized.
const DRIFT_LOOPS_PER_SEC: f32 = 1.0 / 8.0;
const MPC_PER_KPC: f32 = 0.001;
// Fraction of the loop faded in at its start and out at its end, so the wrap never pops;
// dividing by the envelope's mean, 1 - DRIFT_FADE, keeps the stream's mean brightness.
const DRIFT_FADE: f32 = 0.2;
// Streak length, in sprite radii, at which a streak's brightness halves.
const STREAK_HALF_DIM_RADII: f32 = 1.25;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  @location(0) pos: vec3<f32>,
  @location(1) tangent: vec3<f32>,
  @location(2) attr: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  let corner = vec2<f32>(f32(vi & 1u) * 2.0 - 1.0, f32(vi >> 1u) * 2.0 - 1.0);
  let size = attr.x * u.sizeScale;
  let phase = fract(u.timeSec * DRIFT_LOOPS_PER_SEC + rand01(ii));
  let rel = pos + tangent * (u.flow * MPC_PER_KPC) * (phase - 0.5) - u.eye;
  let centreClip = worldToClip(u.cam, rel);
  if (centreClip.w <= 0.0) {
    out.clipPos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let dist = length(rel);
  let rTrue = size / max(dist, 1e-12) * u.cam.pxPerRad;
  let rPx = max(rTrue, u.minPx);
  let tipClip = worldToClip(u.cam, rel + tangent * size * u.stretch);
  var axis = vec2<f32>(1.0, 0.0);
  var lPx = 0.0;
  if (tipClip.w > 0.0) {
    let streakNdc = tipClip.xy / tipClip.w - centreClip.xy / centreClip.w;
    let streakPx = streakNdc * 0.5 * u.cam.viewportPx;
    lPx = length(streakPx);
    if (lPx > 1e-3) { axis = streakPx / lPx; }
  }
  let perp = vec2<f32>(-axis.y, axis.x);
  let halfAcross = STREAK_HALF_ACROSS_RADII * rPx;
  let halfAlong = lPx + halfAcross;
  let offPx = axis * corner.x * halfAlong + perp * corner.y * halfAcross;
  out.clipPos = centreClip + vec4<f32>(offPx * 2.0 / u.cam.viewportPx * centreClip.w, 0.0, 0.0);
  out.uvPx = vec2<f32>(corner.x * halfAlong, corner.y * halfAcross);
  out.shape = vec2<f32>(lPx, rPx);
  let area = (rTrue * rTrue) / (rPx * rPx);
  let envelope = smoothstep(0.0, DRIFT_FADE, phase) * smoothstep(1.0, 1.0 - DRIFT_FADE, phase)
    / (1.0 - DRIFT_FADE);
  let lum = attr.y * area / (1.0 + lPx / (STREAK_HALF_DIM_RADII * rPx))
    * select(1.0, envelope, u.flow > 0.0);
  let bpRp = mix(STREAM_BP_RP_RANGE.x, STREAM_BP_RP_RANGE.y, attr.z);
  let emphasis = select(u.recede, u.focusBoost, attr.w == u.focusedStream);
  out.colour = starTint(bpRp) * lum * u.intensity * emphasis;
  return out;
}
