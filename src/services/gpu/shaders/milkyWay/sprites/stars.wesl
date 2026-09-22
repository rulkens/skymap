// milkyWay/sprites/stars.wesl — shader-math derivation file (exceeds the
// usual header budget on that basis): the star billboard pass. Each
// generated star is one instanced point expanded on the GPU into a
// eye-facing quad, shaded as a soft radial glow, and drawn with ADDITIVE
// blending (pipeline-side) so overlapping stars sum their light — the
// physically-correct model for unresolved point sources.
//
// The galaxy-renderer tool draws THIS pass too, through a directory symlink
// onto milkyWay/sprites/ (see the tool's wesl.toml) — one shader, two
// consumers, so an edit here changes both.
//
// ## Why the screen-size clamp is flux-conserving
//
// The vertex stage clamps each sprite's on-screen half-extent to
// [starPxMin, starPxMax] pixels: starPxMin is the anti-sparkle FLOOR (a
// distant star never shrinks below a stable dot, so it stops twinkling as
// sub-pixel coverage flickers); starPxMax CAPS foreground swell on close
// flythroughs. Resizing a sprite also resizes how much light it emits: the
// fragment falloff runs over the quad's OWN corner coords, so peak alpha
// never learns the quad's screen size and total emission tracks screen
// AREA. The vertex stage therefore divides emission by the square of the
// resize factor 'k' (angular, not projected — see the vertex stage), which
// keeps the clamp a pure SIZE decision in both
// directions — the floor stabilises coverage without inflating the far
// field, the cap bounds fill without dimming a close approach. A dead
// record (size 0) projects its corner onto its center, giving a
// zero-length delta that the 'lPx > 0' guard skips — so the floor never
// resurrects a dead sprite (it stays zero-area) and its flux correction
// stays exactly 1.
//
// ## Why the flux-conserving LOD exists
//
// At mid/far views the whole star budget collapses onto a handful of
// pixels, and additive blending serializes the blender per pixel — so
// subpixel stars are culled in the VERTEX stage (degenerate quad, zero
// fragments) instead, with survivors brightened so total light holds. The
// LOD works on the sprite's ANGULAR apparent size (see 'apparent' below),
// captured before the pixel clamp derives 'k' from the same number.

import package::milkyWay::sprites::io::u;
import package::milkyWay::sprites::io::spriteBillboardOffset;
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
  // billboard corner out along this instance's own eye-facing basis. 'k'
  // below scales this SAME offset for all four corners of one sprite, so
  // — unlike a per-corner projected size — they agree on size by
  // construction and a sprite never tears at the LOD's cull threshold.
  let center = (u.model * vec4<f32>(inPos, 1.0)).xyz;
  let offsetWorld = spriteBillboardOffset(u.model, u.camPosModel.xyz, inPos, corner) * worldHalfExtent;

  // Apparent size is ANGULAR — half-extent over distance, times the view's
  // pixels per radian — so every face of a multi-view rig measures a sprite
  // identically; a per-face projected size differs across a seam and kinks
  // the field there. distWorld: model-space distance through the model's
  // uniform scale (params0.z).
  let distWorld = length(inPos - u.camPosModel.xyz) * modelScale;
  let halfRad = worldHalfExtent / max(distWorld, 1e-30);
  let lPx = halfRad * u.cam.pxPerRad;
  // The LOD band was tuned against the NDC length of the (1,1) corner's
  // projected delta; this is that same number for an on-axis sprite.
  let apparent = lPx * 2.0 * length(vec2<f32>(1.0 / u.cam.viewportPx.x, 1.0 / u.cam.viewportPx.y));
  var k = 1.0;
  if (lPx > 0.0) { k = clamp(lPx, u.params1.x, u.params1.y) / lPx; }
  // Conserve flux across that resize: peak alpha is fixed by the corner
  // coords, so a sprite's total light is proportional to its screen area —
  // which, left alone, is already inverse-square correct. Scaling the quad
  // by k scales its area by k*k, so dividing emission by k*k restores the
  // light exactly, in BOTH directions: at the floor k > 1, cancelling the
  // inflation the floor would otherwise hand the far field; at the cap
  // k < 1, brightening a close star instead of dimming it (a star you are
  // nearly inside really is blinding — the tone mapper and bloom exist for
  // that, so no ceiling is imposed on the boost).
  let clampFluxScale = 1.0 / (k * k);
  // Every corner projected exactly: the rasteriser clips a corner behind the
  // eye in homogeneous space, and exact projection is what makes two faces
  // draw one world quad.
  var kClip = worldToClip(u.cam, center + offsetWorld * k);

  // Survive the adaptive NEAR0 far plane: on a deep descent (or a tight orbit
  // of another local-volume body) the foreground far plane pulls inside the
  // disc's far edge, and without this the distant half of the cloud is
  // frustum-clipped while the approach fade still shows it. Clamp clip-z just
  // inside the far plane instead — identical to starCatalog/vertex.wesl. Safe
  // ONLY because this is a depthless pass (no depth test/write in the
  // pipeline), so the clamped depth perturbs no depth compare.
  kClip.z = min(kClip.z, kClip.w * (1.0 - CLIP_Z_EPS));

  // Flux-conserving LOD — the band math and its tuning rationale live in
  // lib/cloudSprite.wesl. It is independent of the clamp correction above and
  // does not double-count it: it keys off 'apparent', the NDC size captured
  // BEFORE the rescale, and answers a different question (how many sprites
  // survive, and by how much the survivors stand in for the culled). The two
  // factors multiply onto bright.
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
