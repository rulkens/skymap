// milkyWay/sprites/stars.wesl — the star billboard pass. Each generated star is
// one instanced point expanded on the GPU into a camera-facing quad, shaded
// as a soft radial glow, and drawn with ADDITIVE blending (pipeline-side) so
// overlapping stars sum their light — the physically-correct model for
// unresolved point sources.
//
// ## Shared with the tool's star.wesl via lib/cloudSprite.wesl
//
//   - The fragment core+glow radial falloff (starGlowAlpha) and the
//     flux-conserving LOD (fluxConservingLod) are single-homed in
//     lib/cloudSprite.wesl and imported by both this pass and the
//     galaxy-renderer tool's star pass.
//   - The billboard corner expansion (center + right*corner.x + up*corner.y)
//     and the project-center-and-corner-then-measure-the-delta structure of
//     the screen-size clamp remain per-pass (see below for why the clamp
//     differs).
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
//   2. Screen-size clamp in PIXELS, not NDC — and FLUX-CONSERVING. The tool
//      capped the projected half-extent at 0.11 NDC. Here we convert the NDC
//      delta to pixels via viewportPx and clamp to [starPxMin, starPxMax].
//      The px FLOOR is the anti-sparkle lever the tool lacked — a distant
//      star never shrinks below a stable dot, so it stops twinkling as
//      sub-pixel coverage flickers; the px CAP bounds foreground swell on
//      close flythroughs. Resizing a sprite also resizes how much light it
//      emits: the fragment falloff runs over the quad's OWN corner coords, so
//      peak alpha never learns the quad's screen size and total emission
//      tracks screen AREA. The vertex stage therefore divides emission by the
//      square of the size ratio, which keeps the clamp a pure SIZE decision
//      in both directions — the floor stabilises coverage without inflating
//      the far field, the cap bounds fill without dimming a close approach.
//      A dead record (size 0) projects its corner onto its center, giving a
//      zero-length delta that the 'lPx > 0' guard skips — so the floor never
//      resurrects a dead sprite (it stays zero-area) and its flux correction
//      stays exactly 1.
//
//   3. Fade multiplies EMISSION. fadeAlpha scales the final star colour, so a
//      faded-out Milky Way adds no light under the additive blend.
//
// The flux-conserving LOD (the vertex tail below) matters here because at
// mid/far views the whole star budget collapses onto a handful of pixels,
// and additive blending serializes the blender per pixel — so subpixel
// stars are culled in the VERTEX stage (degenerate quad, zero fragments).
// The LOD works on the NDC apparent size (the band was tuned in NDC units
// in the tool), captured before the px-space clamp rescales the corner
// delta. The tool's cull-bright block (a hard brightness floor on params.w)
// is NOT ported — a quality knob defaulted off, unrelated to the perf
// lever.

import package::milkyWay::sprites::io::u;
import package::lib::camera::worldToClip;
import package::lib::cloudSprite::fluxConservingLod;
import package::lib::cloudSprite::starGlowAlpha;

// Depth epsilon: pull the clamped clip-z this far inside the far plane so a
// sprite sitting exactly ON it still passes the clip test.
const CLIP_Z_EPS: f32 = 1e-4;

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
  // Emission factor that undoes the area change the px clamp is about to make
  // (see the inner block). Declared out here so that every path which applies
  // NO clamp — center or corner behind the camera, or a zero-length delta —
  // leaves it at exactly 1.0 and needs no correction of its own.
  var clampFluxScale = 1.0;
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
      // Conserve flux across that resize. Peak alpha is fixed by the corner
      // coords, so a sprite's total light is proportional to its screen area
      // — which, left alone, is already inverse-square correct: the projected
      // half-extent goes as 1/distance, so the area goes as 1/distance^2.
      // That is exactly why a clamp breaks it. Scaling the quad by
      // k = targetPx / lPx scales its area by k*k, so dividing emission by
      // k*k restores the sprite's light exactly.
      //
      // Applied in BOTH directions. At the floor k > 1, so this cancels the
      // inflation the floor would otherwise hand the entire far field (which
      // all sits on the floor). At the cap k < 1, so it BRIGHTENS a close
      // star instead of capping it — the honest reading, since a star you are
      // nearly inside really is blinding and the tone mapper and bloom exist
      // for that. No ceiling is imposed on the boost: any ceiling would only
      // move the un-conserved regime to a different threshold rather than
      // remove it, and the alternative (correcting the floor only) would make
      // the clamp conserve light in one direction and eat it in the other.
      let invK = lPx / targetPx;
      clampFluxScale = invK * invK;
    }
  }

  // Survive the adaptive NEAR0 far plane: on a deep descent (or a tight orbit
  // of another local-volume body) the foreground far plane pulls inside the
  // disc's far edge, and without this the distant half of the cloud is
  // frustum-clipped while the approach fade still shows it. Clamp clip-z just
  // inside the far plane instead — identical to starCatalog/vertex.wesl. Safe
  // ONLY because this is a depthless pass (no depth test/write in the
  // pipeline), so the clamped depth perturbs no depth compare.
  kClip.z = min(kClip.z, kClip.w * (1.0 - CLIP_Z_EPS));

  // Flux-conserving LOD — the band math and its tuning rationale live in
  // lib/cloudSprite.wesl, shared with the galaxy-renderer tool's passes. It is
  // independent of the clamp correction above and does not double-count it: it
  // keys off 'apparent', the NDC size captured BEFORE the rescale, and answers
  // a different question (how many sprites survive, and by how much the
  // survivors stand in for the culled). The two factors multiply onto bright.
  let lod = fluxConservingLod(inPos, apparent, u.params1.w);

  // A culled star parks its quad outside clip space — all four corners land
  // on the same point past the +w plane, so nothing rasterizes and the
  // fragment stage never runs for it.
  if (lod.cull) { o.pos = vec4<f32>(2.0, 2.0, 2.0, 1.0); } else { o.pos = kClip; }
  o.uv = corner;
  o.color = inColor;
  o.bright = inSB.y * lod.boost * clampFluxScale;
  return o;
}

@fragment
fn fs(i: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(i.uv, i.uv);
  if (r2 > 1.0) { discard; }
  // Core+glow radial falloff from lib/cloudSprite.wesl, scaled by the
  // exposure knob.
  let exposure = u.params0.y;
  // Blend the tight core+glow profile toward a broad Gaussian, from the
  // settings.milkyWay softness knob. A tight-cored sprite needs dozens of
  // overlaps per pixel before a field of them reads smooth; a broad one needs
  // a handful, which is why Celestia-style renderers use few large soft
  // splats. Both profiles are normalised to the same integral over the unit
  // disc (0.9294 vs 0.8956, hence the 1.038), so this changes SHAPE without
  // changing how much light the sprite contributes -- moving the slider
  // measures smoothness, not exposure.
  let softness = u.params0.w;
  let broad = max(0.0, exp(-r2 * 2.5) - 0.0821) * 1.038;
  let a = mix(starGlowAlpha(r2), broad, softness) * exposure;
  // fadeAlpha multiplies EMISSION: at fadeAlpha 0 the star adds no light.
  let fadeAlpha = u.params0.x;
  return vec4<f32>(i.color * i.bright * a * fadeAlpha, a);
}
