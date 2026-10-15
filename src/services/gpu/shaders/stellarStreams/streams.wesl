// stellarStreams/streams.wesl — PROTOTYPE. Each stream particle is a screen-space
// streak billboard: a Gaussian smeared along its projected orbital tangent, so a
// stream reads as flowing debris rather than dots. Surface brightness is held
// constant while resolved; below 'minPx' the sprite clamps and dims by area, so
// distant streams stay smooth haze instead of aliasing sparkle.

import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;

struct Uniforms {
  cam: CameraUniforms,
  eye: vec3<f32>,
  intensity: f32,
  sizeScale: f32,
  stretch: f32,
  minPx: f32,
  timeSec: f32,
  flow: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
};

struct VSOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) uvPx: vec2<f32>,
  @location(1) @interpolate(flat) shape: vec2<f32>,
  @location(2) @interpolate(flat) colour: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const BHB: vec3<f32> = vec3<f32>(0.62, 0.76, 1.0);
const GIANT: vec3<f32> = vec3<f32>(1.0, 0.70, 0.40);

fn hash11(x: f32) -> f32 {
  return fract(sin(x * 127.1) * 43758.5453);
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  @location(0) pos: vec3<f32>,
  @location(1) tangent: vec3<f32>,
  @location(2) attr: vec4<f32>,
) -> VSOut {
  var out: VSOut;
  let c = vec2<f32>(f32(vi & 1u) * 2.0 - 1.0, f32(vi >> 1u) * 2.0 - 1.0);
  let size = attr.x * u.sizeScale;
  // Drift along the orbit: a looping slide with a per-particle phase, faded in
  // and out at the loop ends so the wrap-around never pops; the /0.8 restores
  // the plateau window's mean brightness.
  let phase = fract(u.timeSec * 0.05 + hash11(f32(ii)));
  let rel = pos + tangent * size * u.flow * (phase - 0.5) * 6.0 - u.eye;
  let c0 = worldToClip(u.cam, rel);
  if (c0.w <= 0.0) {
    out.clipPos = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return out;
  }
  let dist = length(rel);
  let rTrue = size / max(dist, 1e-12) * u.cam.pxPerRad;
  let rPx = max(rTrue, u.minPx);
  let c1 = worldToClip(u.cam, rel + tangent * size * u.stretch);
  var axis = vec2<f32>(1.0, 0.0);
  var lPx = 0.0;
  if (c1.w > 0.0) {
    let d = (c1.xy / c1.w - c0.xy / c0.w) * 0.5 * u.cam.viewportPx;
    lPx = length(d);
    if (lPx > 1e-3) { axis = d / lPx; }
  }
  let perp = vec2<f32>(-axis.y, axis.x);
  let halfAlong = lPx + 2.0 * rPx;
  let halfAcross = 2.0 * rPx;
  let offPx = axis * c.x * halfAlong + perp * c.y * halfAcross;
  out.clipPos = c0 + vec4<f32>(offPx * 2.0 / u.cam.viewportPx * c0.w, 0.0, 0.0);
  out.uvPx = vec2<f32>(c.x * halfAlong, c.y * halfAcross);
  out.shape = vec2<f32>(lPx, rPx);
  let area = (rTrue * rTrue) / (rPx * rPx);
  let envelope = smoothstep(0.0, 0.2, phase) * smoothstep(1.0, 0.8, phase) / 0.8;
  let lum = attr.y * area / (1.0 + lPx / (1.25 * rPx)) * mix(1.0, envelope, min(u.flow, 1.0));
  out.colour = mix(BHB, GIANT, attr.z) * lum * u.intensity;
  return out;
}

@fragment
fn fs(input: VSOut) -> @location(0) vec4<f32> {
  let da = max(abs(input.uvPx.x) - input.shape.x, 0.0);
  let d2 = (da * da + input.uvPx.y * input.uvPx.y) / (input.shape.y * input.shape.y);
  let g = exp(-2.0 * d2);
  return vec4<f32>(input.colour * g, 0.0);
}
