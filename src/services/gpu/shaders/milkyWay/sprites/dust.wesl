// milkyWay/sprites/dust.wesl — the dust-lane pass. Same camera-facing billboard
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
// ## Why the clamp is NDC here and pixels in stars.wesl
//
// Dust lanes are broader features than stars and tolerate a larger foreground
// extent before they need reining in. The pixel clamp is a star-only
// calibration lever (anti-sparkle), so dust keeps a fixed 0.16-NDC cap with no
// starPxMin/starPxMax knob.
//
// The galaxy-renderer tool draws this pass too, through a directory symlink
// onto milkyWay/sprites/ (see the tool's wesl.toml) — one shader, two
// consumers.

import package::milkyWay::sprites::io::u;
import package::lib::camera::worldToClip;
import package::lib::cloudSprite::dustTransmittance;

// Depth epsilon: pull the clamped clip-z this far inside the far plane so a
// sprite sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

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

  // Survive the adaptive NEAR0 far plane: on a deep descent (or a tight orbit
  // of another local-volume body) the foreground far plane pulls inside the
  // disc's far edge, and without this the distant dust lanes are
  // frustum-clipped while the approach fade still shows them. Clamp clip-z
  // just inside the far plane instead — identical to starCatalog/vertex.wesl.
  // Safe ONLY because this is a depthless pass (no depth test/write in the
  // pipeline), so the clamped depth perturbs no depth compare.
  kClip.z = min(kClip.z, kClip.w * (1.0 - CLIP_Z_EPS));

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
  // Extinction math (edge falloff + per-channel transmittance) lives in
  // lib/cloudSprite.wesl.
  let T = dustTransmittance(r2, i.op);
  // fadeAlpha mixes T toward vec3(1) (the multiplicative identity): at
  // fadeAlpha 0 the dust stops darkening the scene entirely.
  let fadeAlpha = u.params0.x;
  return vec4<f32>(mix(vec3<f32>(1.0), T, fadeAlpha), 1.0);
}
