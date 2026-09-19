// localBubble/fragment.wesl — additive Fresnel rim for the shell: the same
// pow(1 - |N.V|, RIM_POWER) line as horizonShell/fragment.wesl, applied to a
// real mesh's interpolated normal/position rather than a raymarched hit. The
// normal is renormalised here — flat per-vertex normals would otherwise make
// every triangle edge visible as a facet.

struct Uniforms {
  model: mat4x4<f32>,
  tint: vec3<f32>,
  opacity: f32,
  _reserved: vec4<f32>,
};

struct Camera {
  viewProj: mat4x4<f32>,
  eye: vec3<f32>,
  _pad: f32,
};

struct VSOut {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> cam: Camera;

const RIM_POWER: f32 = 3.0;

@fragment
fn fs(input: VSOut) -> @location(0) vec4<f32> {
  let n = normalize(input.worldNormal);
  let v = normalize(cam.eye - input.worldPos);
  let rim = pow(1.0 - abs(dot(n, v)), RIM_POWER);
  let value = rim * u.opacity;
  return vec4<f32>(u.tint * value, value);
}
