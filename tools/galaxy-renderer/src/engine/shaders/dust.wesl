// dust.wesl — the dust-lane pass. Same camera-facing billboard + flux-
// conserving LOD as star.wesl, but shaded and blended completely
// differently: dust does not EMIT light, it ABSORBS it. Each dust sprite
// outputs a per-channel transmittance and is drawn with a src·dst
// (multiplicative) blend so it darkens and reddens whatever light is behind
// it — never painting an opaque brown blob.
//
// ## Why transmittance blending, not additive
//
// Stars add light (a bright sprite makes the pixel brighter). Dust removes
// light (a dust sprite makes the pixel dimmer, and unevenly across
// wavelengths). Modelling that as 'multiply the framebuffer by T' is exactly
// how real extinction works: no light behind the dust => T·0 = 0 => the dust
// is invisible, which is correct — you only see dust silhouetted against the
// glow it's blocking.
//
// The screen-size clamp here is 0.16 NDC (vs the star pass's 0.11): dust
// lanes are broader features and tolerate a larger foreground extent before
// they need reining in.

struct Cam {
  viewProj: mat4x4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  params: vec4<f32>,
}
@group(0) @binding(0) var<uniform> cam: Cam;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) op: f32,
}

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @location(1) inPos: vec3<f32>,
      @location(2) inSize: f32,
      @location(3) inColor: vec3<f32>,
      @location(4) inOp: f32) -> VSOut {
  var o: VSOut;
  let cClip = cam.viewProj * vec4<f32>(inPos, 1.0);
  let world = inPos + (cam.right.xyz * corner.x + cam.up.xyz * corner.y) * inSize;
  var kClip = cam.viewProj * vec4<f32>(world, 1.0);
  var apparent = 1.0;
  if (cClip.w > 0.0 && kClip.w > 0.0) {
    let cN = cClip.xy / cClip.w;
    var d = kClip.xy / kClip.w - cN;
    let l = length(d);
    apparent = l;
    if (l > 0.16) { d = d * (0.16 / l); kClip = vec4<f32>((cN + d) * kClip.w, kClip.z, kClip.w); }
  }
  var cull = false;
  var boost = 1.0;
  let thr = cam.params.z;
  if (thr > 0.0) {
    let a = apparent / thr;
    let h = fract(sin(dot(inPos, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453);
    let fade = smoothstep(h - 0.4, h, a);
    if (fade <= 0.0) { cull = true; } else { boost = min(fade / min(1.0, a + 0.2), 3.0); }
  }
  if (cull) { o.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0); } else { o.pos = kClip; }
  o.uv = corner;
  o.color = inColor;
  o.op = inOp * boost;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let a = smoothstep(1.0, 0.0, sqrt(r2)) * i.op;
  // Wavelength-dependent extinction: transmittance per channel (blue absorbed most,
  // red least) — multiplied onto the light behind, so dust darkens + reddens rather
  // than painting a brown colour. No light behind => dust is invisible (correct).
  let T = clamp(vec3<f32>(1.0) - a * vec3<f32>(0.55, 0.78, 1.0), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(T, 1.0);
}
