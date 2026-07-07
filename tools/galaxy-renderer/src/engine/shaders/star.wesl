// star.wesl — the star billboard pass. Each star is one point expanded on
// the GPU into a camera-facing quad, shaded as a soft radial glow, and
// drawn with ADDITIVE blending (pipeline-side) so overlapping stars sum
// their light — the physically-correct model for unresolved point sources.
//
// The vertex stage does two subtle things beyond the billboard expansion:
//
//   1. Screen-size clamp. A star very close to the camera would otherwise
//      swell to fill the screen; we cap the quad's on-screen half-extent to
//      0.11 NDC by shrinking the corner displacement back along its own
//      direction. This keeps foreground stars bounded without touching
//      their brightness.
//
//   2. Flux-conserving level-of-detail. Rather than a hard 'draw if bigger
//      than N pixels' cull (which pops), each star fades in over a band as
//      its apparent size grows past a per-star hashed threshold, and the
//      survivors are brightened by 1/(fraction that faded in) so the TOTAL
//      light of a cluster stays roughly constant as you zoom — no sudden
//      brightening or dimming of the field.
//
// The LOD band math and the fragment core+glow falloff are single-homed in
// the main app's lib/cloudSprite.wesl (shared with the milkyWayCloud
// passes), reached here through the file symlink at lib/cloudSprite.wesl —
// same root-driven package-binding mechanism as the galaxyGen/ symlink.

import package::lib::cloudSprite::fluxConservingLod;
import package::lib::cloudSprite::starGlowAlpha;

struct Cam {
  viewProj: mat4x4<f32>,
  right: vec4<f32>,
  up: vec4<f32>,
  params: vec4<f32>, // x: sizeScale  y: starIntensity  z: lodApparent  w: cullBright
}
@group(0) @binding(0) var<uniform> cam: Cam;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) bright: f32,
}

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @location(1) inPos: vec3<f32>,
      @location(2) inColor: vec3<f32>,
      @location(3) inSB: vec2<f32>) -> VSOut {
  var o: VSOut;
  let size = inSB.x * cam.params.x;
  let cClip = cam.viewProj * vec4<f32>(inPos, 1.0);
  let world = inPos + (cam.right.xyz * corner.x + cam.up.xyz * corner.y) * size;
  var kClip = cam.viewProj * vec4<f32>(world, 1.0);
  var apparent = 1.0;
  if (cClip.w > 0.0 && kClip.w > 0.0) {
    let cN = cClip.xy / cClip.w;
    var d = kClip.xy / kClip.w - cN;
    let l = length(d);
    apparent = l;
    if (l > 0.11) { d = d * (0.11 / l); kClip = vec4<f32>((cN + d) * kClip.w, kClip.z, kClip.w); }
  }
  var cull = inSB.y < cam.params.w;   // hard cull of the very faintest stars (quality knob)
  var boost = 1.0;
  if (!cull) {
    // Flux-conserving LOD — band math + rationale in lib/cloudSprite.wesl.
    let lod = fluxConservingLod(inPos, apparent, cam.params.z);
    cull = lod.cull;
    boost = lod.boost;
  }
  if (cull) { o.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0); } else { o.pos = kClip; }
  o.uv = corner;
  o.color = inColor;
  o.bright = inSB.y * boost;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  // Core+glow radial falloff from lib/cloudSprite.wesl, scaled by intensity.
  let a = starGlowAlpha(r2) * cam.params.y;
  return vec4<f32>(i.color * i.bright * a, a);
}
