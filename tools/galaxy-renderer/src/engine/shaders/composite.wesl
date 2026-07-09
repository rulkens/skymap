// composite.wesl — the final tone-map + grade pass. Combines the HDR scene
// with the bloom pyramid, applies exposure, tone-maps the unbounded HDR into
// displayable [0,1], then grades (saturation, vignette) and gamma-encodes.
//
// Order matters and is physical: add bloom in linear HDR, scale by exposure,
// THEN tone-map — tone mapping is the last step that touches unbounded
// values, so exposure and bloom must precede it. Saturation, vignette, and
// gamma are display-space grades applied after.
//
// The tonemap dispatch keeps four HDR->LDR curves selectable at runtime
// ('u.b.x' mode) so the visual gate can compare them:
//   0 ACES filmic       — cinematic S-curve (2.51/0.03/2.43/0.59/0.14).
//   1 Reinhard          — x/(1+x), simplest roll-off.
//   2 Reinhard extended — preserves highlights up to a whitepoint (w=3).
//   3 Uncharted 2       — Hable filmic, normalised by its own whitepoint 11.2.
//  else Linear clamp    — no curve, reference baseline.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
struct Post { a: vec4<f32>, b: vec4<f32> }   // a: exposure,bloom,saturation,vignette   b.x: tonemap mode
@group(0) @binding(3) var<uniform> u: Post;

fn aces(x: vec3<f32>) -> vec3<f32> {
  let a=2.51; let b=0.03; let c=2.43; let d=0.59; let e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn uncharted2(x: vec3<f32>) -> vec3<f32> {
  let A=0.15; let B=0.50; let C=0.10; let D=0.20; let E=0.02; let F=0.30;
  return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F)) - E/F;
}
fn tonemap(x: vec3<f32>, mode: f32) -> vec3<f32> {
  if (mode < 0.5) { return aces(x); }
  if (mode < 1.5) { return x / (1.0 + x); }                                  // Reinhard
  if (mode < 2.5) { let w = 3.0; return x * (1.0 + x / (w * w)) / (1.0 + x); }  // Reinhard extended
  if (mode < 3.5) { return uncharted2(x) / uncharted2(vec3<f32>(11.2)); }     // Uncharted 2 (filmic)
  return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0));                            // Linear
}

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  var hdr = textureSample(sceneTex, samp, i.uv).rgb;
  let bloom = textureSample(bloomTex, samp, i.uv).rgb;
  hdr = hdr + bloom * u.a.y;
  hdr = hdr * u.a.x;
  var c = tonemap(hdr, u.b.x);
  let l = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  c = mix(vec3<f32>(l), c, u.a.z);
  // vignette
  let d = distance(i.uv, vec2<f32>(0.5, 0.5));
  c = c * (1.0 - u.a.w * smoothstep(0.35, 0.85, d));
  c = pow(c, vec3<f32>(1.0/2.2));
  return vec4<f32>(c, 1.0);
}
