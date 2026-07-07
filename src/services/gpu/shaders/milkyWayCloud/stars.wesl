// milkyWayCloud/stars.wesl — the star billboard pass. Each generated star is
// one instanced point expanded on the GPU into a camera-facing quad, shaded
// as a soft radial glow, and drawn with ADDITIVE blending (pipeline-side) so
// overlapping stars sum their light — the physically-correct model for
// unresolved point sources.
//
// ## Ported verbatim from the tool's star.wesl
//
//   - The fragment core+glow radial falloff: 'core = exp(-r2*5)', 'glow =
//     exp(-r2*1.6)*0.35', the '- 0.0774' edge subtraction that lets alpha
//     reach 0 with no hard rim, and the discard outside the unit disc.
//   - The billboard corner expansion (center + right*corner.x + up*corner.y)
//     and the project-center-and-corner-then-measure-the-delta structure of
//     the screen-size clamp.
//
// ## What changed vs the tool source, and why
//
//   1. Model-matrix placement. The tool projected 'inPos' directly; here the
//      particle CENTER is 'model * vec4(inPos, 1)' first, so one generated
//      cloud can be positioned/oriented/scaled into the scene. The billboard
//      corner is still added in WORLD space along camRight/camUp AFTER the
//      model transform, so sprites face the camera regardless of the model's
//      rotation.
//
//   2. Screen-size clamp in PIXELS, not NDC. The tool capped the projected
//      half-extent at 0.11 NDC. Here we convert the NDC delta to pixels via
//      viewportPx and clamp to [starPxMin, starPxMax]. The px FLOOR is the
//      anti-sparkle lever the tool lacked — a distant star never shrinks
//      below a stable dot, so it stops twinkling as sub-pixel coverage
//      flickers; the px CAP still bounds foreground swell on close
//      flythroughs. A dead record (size 0) projects its corner onto its
//      center, giving a zero-length delta that the 'lPx > 0' guard skips —
//      so the floor never resurrects a dead sprite (it stays zero-area).
//
//   3. Fade multiplies EMISSION. fadeAlpha scales the final star colour, so a
//      faded-out Milky Way adds no light under the additive blend.
//
// The tool's flux-conserving LOD + cull-bright blocks are OMITTED — they were
// defaulted off in the tool, and the point cloud's sprite count is bounded by
// generation, not by a per-star apparent-size fade.

import package::milkyWayCloud::io::u;
import package::lib::camera::worldToClip;

struct VSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) bright: f32,
};

@vertex
fn vs(@location(0) corner: vec2<f32>,
      @location(1) inPos: vec3<f32>,
      @location(2) inColor: vec3<f32>,
      @location(3) inSB: vec2<f32>) -> VSOut {
  var o: VSOut;

  let modelScale = u.params0.z;
  // inSB = (size, brightness): the two contiguous f32s at the end of the
  // star record read as one vec2 attribute, matching the tool's inSB. The
  // size lane also folds in starSizeScale, the visual-gate knob that shrinks
  // (or grows) every star sprite without touching the generated data.
  let worldHalfExtent = inSB.x * modelScale * u.params1.z;

  // Place the particle center through the model transform, then push the
  // billboard corner out along the camera-facing basis in world space.
  let center = (u.model * vec4<f32>(inPos, 1.0)).xyz;
  let cornerWorld = center + (u.camRight.xyz * corner.x + u.camUp.xyz * corner.y) * worldHalfExtent;

  let cClip = worldToClip(u.cam, center);
  var kClip = worldToClip(u.cam, cornerWorld);

  // Pixel-space screen-size clamp (replaces the tool's 0.11-NDC cap). Only
  // meaningful when both center and corner are in front of the camera.
  if (cClip.w > 0.0 && kClip.w > 0.0) {
    let cN = cClip.xy / cClip.w;
    var d = kClip.xy / kClip.w - cN;
    // NDC spans [-1, 1] across viewportPx, so a delta 'd' in NDC is
    // 'd * viewportPx * 0.5' in pixels. Its length is the sprite's on-screen
    // half-extent in pixels.
    let lPx = length(d * u.cam.viewportPx * 0.5);
    if (lPx > 0.0) {
      let targetPx = clamp(lPx, u.params1.x, u.params1.y);
      d = d * (targetPx / lPx);
      kClip = vec4<f32>((cN + d) * kClip.w, kClip.z, kClip.w);
    }
  }

  o.pos = kClip;
  o.uv = corner;
  o.color = inColor;
  o.bright = inSB.y;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  let core = exp(-r2 * 5.0);
  let glow = exp(-r2 * 1.6) * 0.35;
  // Subtract the value at the sprite edge so alpha reaches 0 smoothly (no
  // hard rim); scale the radial falloff by the exposure knob.
  let exposure = u.params0.y;
  let a = max(0.0, (core + glow) - 0.0774) * exposure;
  // fadeAlpha multiplies EMISSION: at fadeAlpha 0 the star adds no light.
  let fadeAlpha = u.params0.x;
  return vec4<f32>(i.color * i.bright * a * fadeAlpha, a);
}
