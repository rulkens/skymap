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
// The tool's flux-conserving LOD block IS ported (the vertex tail below):
// at mid/far views the whole star budget collapses onto a handful of
// pixels, and additive blending serializes the blender per pixel — so
// subpixel stars are culled in the VERTEX stage (degenerate quad, zero
// fragments) over a per-star hashed fade band, and the survivors are
// brightened by 1/(fraction still on), capped at 3x, so the total light of
// the field holds with no popping. The LOD works on the NDC apparent size
// (the band was tuned in NDC units in the tool), captured before the
// px-space clamp rescales the corner delta. The tool's cull-bright block
// (a hard brightness floor on params.w) is NOT ported — a quality knob
// defaulted off, unrelated to the perf lever.

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
  // 'apparent' defaults to 1.0 (LOD leaves off-screen stars alone; clip
  // culling handles them), matching the tool.
  var apparent = 1.0;
  if (cClip.w > 0.0 && kClip.w > 0.0) {
    let cN = cClip.xy / cClip.w;
    var d = kClip.xy / kClip.w - cN;
    // NDC apparent half-extent for the flux-conserving LOD below, captured
    // BEFORE the px clamp rescales 'd' — the LOD band was tuned in NDC
    // units in the tool, while the clamp works in pixels.
    apparent = length(d);
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

  // Flux-conserving LOD, mirrored in the tool's star.wesl: fade each star in
  // over a band as its apparent size (a) grows past its per-star hash;
  // brighten survivors by 1/(fraction on), capped at 3x, so total light
  // holds. thr <= 0 disables the LOD entirely. The hash keys on 'inPos'
  // (generated local space), so a star's threshold is stable across camera
  // and model motion — no frame-to-frame shimmer.
  //
  // The band's lower edge is 'h * 0.6', NOT the constant-width 'h - 0.4': a
  // constant width goes negative for h < 0.4, which kept ~40% of the field
  // at a positive fade no matter how far away the galaxy was — hundreds of
  // thousands of sub-pixel sprites rasterizing into a handful of screen
  // tiles. A proportional edge stays strictly positive, so every star's
  // fade reaches 0 (and its quad degenerates) as a -> 0. The hash is floored
  // away from 0 so the smoothstep edges can never coincide (equal edges are
  // indeterminate in WGSL — a NaN there would stick under additive blend).
  var cull = false;
  var boost = 1.0;
  let thr = u.params1.w;
  if (thr > 0.0) {
    let a = apparent / thr;
    let h = max(fract(sin(dot(inPos, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453), 1e-4);
    let fade = smoothstep(h * 0.6, h, a);
    if (fade <= 0.0) { cull = true; } else { boost = min(fade / min(1.0, a + 0.2), 3.0); }
  }

  // A culled star parks its quad outside clip space — all four corners land
  // on the same point past the +w plane, so nothing rasterizes and the
  // fragment stage never runs for it.
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
