// milkyWayCloud/dust.wesl — the dust-lane pass. Same camera-facing billboard
// as stars.wesl, but shaded and blended completely differently: dust does not
// EMIT light, it ABSORBS it. Each dust sprite outputs a per-channel
// transmittance and is drawn with a src*dst (multiplicative) blend so it
// darkens and reddens whatever light is behind it — never painting an opaque
// brown blob.
//
// ## Why transmittance blending, not additive
//
// Stars add light (a bright sprite makes the pixel brighter). Dust removes
// light (a dust sprite makes the pixel dimmer, and unevenly across
// wavelengths). Modelling that as 'multiply the framebuffer by T' is exactly
// how real extinction works: no light behind the dust => T*0 = 0 => the dust
// is invisible, which is correct — you only see dust silhouetted against the
// glow it is blocking.
//
// ## Ported verbatim from the tool's dust.wesl
//
//   - The fragment transmittance math: 'a = smoothstep(1, 0, sqrt(r2)) * op',
//     then per-channel 'T = clamp(1 - a * vec3(0.55, 0.78, 1.0), 0, 1)' (blue
//     absorbed most, red least) and the discard outside the unit disc.
//   - The 0.16-NDC screen-size clamp, KEPT verbatim: dust lanes are broader
//     features than stars and tolerate a larger foreground extent before they
//     need reining in. The spec's pixel clamp is a star-only calibration
//     lever (anti-sparkle), so dust deliberately keeps the fixed NDC cap with
//     no starPxMin/starPxMax knob.
//
// ## What changed vs the tool source, and why
//
//   1. Model-matrix placement — identical to stars.wesl: the particle CENTER
//      is 'model * vec4(inPos, 1)', the billboard corner is added in world
//      space along camRight/camUp afterward.
//
//   2. Fade FADES TO IDENTITY, not to emission. The tool returned 'vec4(T, 1)'.
//      Here the output is 'vec4(mix(vec3(1), T, fadeAlpha), 1)': at fadeAlpha 0
//      the transmittance collapses to vec3(1) — the multiplicative identity —
//      so a faded-out Milky Way stops darkening the scene entirely (mirroring
//      the star pass, where fadeAlpha 0 stops it brightening the scene).
//
// The tool's flux-conserving LOD block is OMITTED (defaulted off in the tool).

import package::milkyWayCloud::io::u;
import package::lib::camera::worldToClip;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) op: f32,
};

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @location(1) inPos: vec3<f32>,
      @location(2) inSize: f32,
      @location(3) inColor: vec3<f32>,
      @location(4) inOp: f32) -> VSOut {
  var o: VSOut;

  let modelScale = u.params0.z;
  let worldHalfExtent = inSize * modelScale;

  // Place the particle center through the model transform, then push the
  // billboard corner out along the camera-facing basis in world space.
  let center = (u.model * vec4<f32>(inPos, 1.0)).xyz;
  let cornerWorld = center + (u.camRight.xyz * corner.x + u.camUp.xyz * corner.y) * worldHalfExtent;

  let cClip = worldToClip(u.cam, center);
  var kClip = worldToClip(u.cam, cornerWorld);

  // 0.16-NDC screen-size clamp, ported verbatim from the tool's dust pass.
  if (cClip.w > 0.0 && kClip.w > 0.0) {
    let cN = cClip.xy / cClip.w;
    var d = kClip.xy / kClip.w - cN;
    let l = length(d);
    if (l > 0.16) { d = d * (0.16 / l); kClip = vec4<f32>((cN + d) * kClip.w, kClip.z, kClip.w); }
  }

  o.pos = kClip;
  o.uv = corner;
  o.color = inColor;
  o.op = inOp;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let a = smoothstep(1.0, 0.0, sqrt(r2)) * i.op;
  // Wavelength-dependent extinction: transmittance per channel (blue absorbed
  // most, red least) — multiplied onto the light behind, so dust darkens +
  // reddens rather than painting a brown colour. No light behind => dust is
  // invisible (correct).
  let T = clamp(vec3<f32>(1.0) - a * vec3<f32>(0.55, 0.78, 1.0), vec3<f32>(0.0), vec3<f32>(1.0));
  // fadeAlpha mixes T toward vec3(1) (the multiplicative identity): at
  // fadeAlpha 0 the dust stops darkening the scene entirely.
  let fadeAlpha = u.params0.x;
  return vec4<f32>(mix(vec3<f32>(1.0), T, fadeAlpha), 1.0);
}
