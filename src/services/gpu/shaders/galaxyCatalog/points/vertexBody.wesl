// points/vertexBody.wesl — the galaxy point vertex stage as one function.
//
// Every galaxy point prologue calls this: today the flat 'vertex.wesl' entry
// point, which hands it the vertex-buffer attributes and its module's bindings.
// The uniform structs travel by value (precedent: 'focusAlphaMultiplier'), so
// a second prologue with other bindings reuses bias modes, the distance fade,
// the SB terms, highlight and pick unchanged. 'p' is a constructed value: a
// prologue reading storage builds it field by field, never by passing a
// storage struct by value (the Adreno landmine in docs/RENDERER.md).
// 'pickIndex' is the index the pick path packs beside the source code.

import package::galaxyCatalog::points::io::Uniforms;
import package::galaxyCatalog::points::io::PerVertex;
import package::galaxyCatalog::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::selectionEncoding::packSelection;
import package::lib::focusUniforms::FocusUniforms;
import package::lib::focusUniforms::focusAlphaMultiplier;
import package::lib::focusUniforms::FOCUS_PICK_EXCLUDE_BELOW;

fn galaxyPointVertex(
  vi: u32,
  pickIndex: u32,
  p: PerVertex,
  u: Uniforms,
  source: SourceUniforms,
  focus: FocusUniforms,
) -> VSOut {
  // Project the point's 3-D world position to clip space via the
  // shared 'worldToClip' helper from 'lib/camera.wesl'.
  let center = worldToClip(u.cam, p.position);

  // Fetch the circumscribing-triangle corner for this vertex — the
  // equilateral triangle around the unit UV circle, spanning
  // [-sqrt(3), sqrt(3)] x [-1, 2]. The fragment's r-squared > 1 discard
  // trims it back to the same disc a quad would show.
  let corner = triCorner(vi);

  // ── Malmquist-bias gating (volume-limited mode) ──────────────────────────
  //
  // The galaxy's absolute magnitude ('M = m - 5·log10(d_Mpc) - 25') is
  // baked into the per-instance 'p.absMag' at upload time — it's a
  // galaxy-static value, so recomputing the log10 + sqrt here cost ~15 M
  // wasted transcendentals per frame at the large tier.
  //
  // 'discard' is fragment-stage only; the vertex stage gates by emitting
  // a clip-space coordinate outside the unit cube, so all 3 vertices of
  // the gated triangle land at NDC (2,2,2) and the GPU drops the primitive.

  // Recover the per-instance packed identity for the pick path. Bits
  // 26..31 = 6-bit 'source.sourceCode' (this draw's galaxy catalog, set per-
  // source via the prologue's per-source binding); bits 0..26 = 'pickIndex'
  // (the flat prologue passes '@builtin(instance_index)', local 0..count-1).
  let myPacked = packSelection(source.sourceCode, pickIndex);

  // Provenance flags: each axis's 'this value was estimated, not measured'
  // bit rides the sign bit of that axis's per-instance attribute.
  //
  // A row carrying the format's NaN "no measurement" sentinel in both slots
  // reads as MEASURED on both axes ('NaN < 0.0' is false). Deliberate for the
  // highlight (nothing to audit on a row with no catalogued value), but it
  // means an 'estimated'-only filter culls those rows too.
  let orientEstimated = p.axisRatio < 0.0;
  let sizeEstimated = p.radiusMpc < 0.0;

  // Vertex-side cull: galaxies gated out by Malmquist mode 1 (volume-
  // limited) or by either provenance filter emit a degenerate clip position
  // so all 3 vertices of the triangle land outside the NDC cube and the
  // rasteriser drops the primitive — no fragment work, no pick-texture
  // write, so a culled galaxy is not clickable either.
  //
  // Filter codes (see 'points/io.wesl'): 0 = all, 1 = only measured,
  // 2 = only estimated. The two axes AND together — a galaxy must pass both.
  let malmquistGated = u.biasMode == 1u && p.absMag > u.absMagLimit;
  let orientGated = (u.orientationFilter == 1u && orientEstimated)
    || (u.orientationFilter == 2u && !orientEstimated);
  let sizeGated = (u.sizeFilter == 1u && sizeEstimated)
    || (u.sizeFilter == 2u && !sizeEstimated);
  if (malmquistGated || orientGated || sizeGated) {
    var earlyOut: VSOut;
    earlyOut.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    earlyOut.uv = corner;
    earlyOut.instanceTint = vec4<f32>(0.0, 0.0, 0.0, 0.0);
    earlyOut.instanceIdx = myPacked;
    earlyOut.ellipse = vec3<f32>(1.0, 0.0, 1.0);
    return earlyOut;
  }

  // ── APPARENT-SIZE BILLBOARD RADIUS ───────────────────────────────────────
  //
  // Each galaxy's billboard occupies its real angular footprint on
  // screen but never vanishes below 'u.pointSizePx' (the far-field
  // 'still detectable as a glowing dot' floor). The per-instance
  // 'p.radiusMpc' carries the already-padded world-space half-extent —
  // bake site applied the 4× thumbnail-footprint padding and the
  // missing-diameter floor, so the shader reads it directly.
  let toGalaxy = p.position - u.camPosWorld;
  let distanceMpc = length(toGalaxy);
  // Guard distanceMpc against 0 so we don't divide-by-zero when the camera
  // is parked exactly on a galaxy (test fixture path; not a real scenario).
  let safeDist = max(distanceMpc, 0.001);
  // Use the magnitude only: 'radiusMpc's sign bit is a fallback-diameter
  // flag, so the raw value can be negative and must not drive sizing.
  let radiusMag = abs(p.radiusMpc);
  let apparentPxRadius = (radiusMag / safeDist) * u.pxPerRad;
  // In the pick pass, clamp the billboard to the dot floor: resolved
  // galaxy disks are now picked by the procedural-disk pass at the disk
  // edge, so the point pick only needs to claim a small dot.
  let inPickPass = u.pickPass == 1u;
  let sizePx = select(max(u.pointSizePx, apparentPxRadius), u.pointSizePx, inPickPass);

  // ── PIXEL-SIZE-IN-CLIP-SPACE CONVERSION ──────────────────────────────────
  //
  // 'expandBillboardScreen' computes the clip-space delta for a 'sizePx'-
  // pixel-radius screen-aligned billboard corner. See 'lib/billboard.wesl'
  // for the centerClip.w / viewportPx cancellation derivation.
  let offset = expandBillboardScreen(u.cam, center, sizePx, corner);

  var out: VSOut;

  // Add the screen-space offset to the projected centre — only X/Y move.
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Triangle corner as UV; the fragment uses it for distance-from-centre.
  out.uv = corner;

  // p.colorIndex is the rest-frame, sentinel-substituted ramp position
  // — K-correction and the unknown-colour fallback already happened
  // CPU-side in pickColourIndex. The shader just looks the value up.

  // ── SURFACE BRIGHTNESS → INTENSITY, with every per-instance modulator folded in ──
  //
  //   intensity = min(sbAmp, u.galaxySbMax)    // physical SB base, bloom-ceiling clamped
  //               × u.galaxySbScale             // overall HDR gain (live knob)
  //               × source.sbBoost              // per-source lift (e.g. faint Milliquas quasars)
  //               × fluxFalloff                 // readability falloff, pow(resolvedFrac, k)
  //               × u.brightness                // global slider
  //               × angularWeight  (mode 2: build-time HEALPix re-weight)
  //               × crossfadeOut   (procedural-disk handoff band)
  //               × focusMult      (structure-focus dim)
  //
  // The old apparent-magnitude clamp is gone: p.sbAmp is the baked physical
  // surface-brightness amplitude and u.galaxySbScale is the live HDR gain that
  // replaced the hardcoded GALAXY_SB_SCALE const. All factors are per-instance
  // constants, so the fragment reads out.instanceTint.rgb directly — no
  // per-pixel multiply for the brightness modulator (the ramp colour it
  // multiplies against IS evaluated per-fragment; see colorFragment.wesl).
  let angularMult = select(1.0, p.angularWeight, u.biasMode == 2u);

  // Crossfade-out against the procedural-disk pass. ThumbnailRenderer
  // fades IN across [pxFadeStart, pxFadeEnd] (apparent-pixel diameter);
  // we fade OUT with the complementary smoothstep so the additive HDR
  // contribution stays constant per galaxy through the band.  The pick
  // pass skips this fade so dimmed-by-crossfade galaxies remain
  // pickable via the clamped dot billboard.
  let apparentDiameterPx = sizePx * 0.5;
  let crossfadeOut = select(
    1.0 - smoothstep(u.pxFadeStart, u.pxFadeEnd, apparentDiameterPx),
    1.0,
    inPickPass,
  );

  // Cluster-focus dim: non-members of the focused POI fade toward 0.08,
  // scaled by the smoothstep blend. Collapses to exactly 1.0 when no POI
  // is focused (blend == 0) AND for members (mix(1.0, 1.0, blend)), so a
  // value below 1.0 uniquely marks a non-member of an active focus — used
  // both for the visual dim here and the pick exclusion below.  The dim
  // folds into the same intensity the invisibility cull tests, so a faded
  // non-member that drops under the perceptibility floor is culled rather
  // than left to pile up additively in a dense field.
  let focusMult = focusAlphaMultiplier(p.position, focus);
  // Physical surface-brightness intensity. p.sbAmp is the baked intrinsic
  // amplitude; u.galaxySbMax caps how bright a compact galaxy can emit (the
  // live bloom-ceiling knob); u.galaxySbScale is the overall HDR gain.
  let sbAmpClamped = min(p.sbAmp, u.galaxySbMax);
  // Readability falloff, gated by the depth-fade toggle: pow(resolvedFrac, k)
  // with k = u.galaxyFalloffStrength. k = 2 is the full physical inverse-square
  // (unresolved galaxies dim as (angular / floor)^2); lower k keeps the deep
  // field visible; toggle OFF holds flat constant surface brightness.
  let resolvedFrac = clamp(apparentPxRadius / u.pointSizePx, 0.0, 1.0);
  let fluxFalloff = select(1.0, pow(resolvedFrac, u.galaxyFalloffStrength), u.depthFadeEnabled == 1u);
  // source.sbBoost is the per-source lift, applied after the SB-scale and
  // bloom-ceiling clamp so it can brighten even a galaxy already at u.galaxySbMax.
  let intensity = sbAmpClamped * u.galaxySbScale
    * source.sbBoost
    * fluxFalloff
    * u.brightness
    * angularMult
    * crossfadeOut
    * focusMult;

  // ── out.instanceTint: two encodings behind one sign bit ──────────────────
  //
  // NORMAL PATH. .rgb carries the brightness MODULATOR alone and .w the
  // galaxy's colour index. The ramp colour is deliberately NOT evaluated
  // here: 'colorFragment.wesl' calls 'rampRadial(instanceTint.w, r)' per
  // fragment instead, because the warm-core / cool-rim gradient's argument
  // depends on the fragment's radius within the billboard and so cannot be
  // baked as a flat per-instance constant (see the 'VSOut has no fifth
  // @location' comment in io.wesl for why paying one ramp call per covered
  // pixel beats spending an interpolator slot).
  //
  // HIGHLIGHT PATH. A provenance highlight REPLACES the galaxy's colour
  // instead of tinting it. Multiplying an audit tint into an already-red
  // galaxy darkens it rather than making it pop, and the whole point of the
  // overlay is that flagged rows are impossible to miss. Amber / magenta /
  // green are colours no real galaxy SED produces, so a flagged row reads as
  // unmistakably artificial against the field — and the overlay deliberately
  // renders FLAT rather than gradient-modulated for the same reason: a debug
  // marker that shades like a galaxy is a worse debug marker.
  //
  // The two paths share one vec4, and the SIGN of .w picks between them.
  // 'pickColourIndex' (src/data/galaxyCatalog/colourIndex.ts) clamps every
  // colour index to [0, 2], so a negative .w can never occur naturally — it
  // is a free, unambiguous sentinel meaning 'the highlight is active, .rgb is
  // already the final colour, skip the ramp'. This is the same
  // sign-bit-as-flag idiom the per-vertex attributes already use twice
  // ('axisRatio' sign = orientation fallback, 'radiusMpc' sign = diameter
  // fallback). The alternative — a fifth varying carrying a boolean — costs a
  // whole interpolator slot on a pass that is fragment/blend-bound; a sign
  // test costs nothing.
  //
  // safeAB, the ellipse-mask coefficient, is computed here rather than at the
  // 'out.ellipse' packing below because it derives from 'p.axisRatio', which
  // is in scope at this point. It defaults to 1.0 (circle) for invalid / NaN
  // axis ratios: 'abs(NaN) > 0.0' is false, so the select branch is the
  // correct gate.
  let orientHighlight = u.orientationHighlight == 1u && orientEstimated;
  let sizeHighlight = u.sizeHighlight == 1u && sizeEstimated;

  let HIGHLIGHT_BOOST = 2.5;
  var highlightRgb = vec3<f32>(0.0);
  var highlightActive = false;
  if (orientHighlight && sizeHighlight) {
    highlightRgb = vec3<f32>(1.0, 0.85, 0.1);
    highlightActive = true;
  } else if (orientHighlight) {
    highlightRgb = vec3<f32>(1.0, 0.1, 0.9);
    highlightActive = true;
  } else if (sizeHighlight) {
    highlightRgb = vec3<f32>(0.15, 1.0, 0.25);
    highlightActive = true;
  }

  let absAR = abs(p.axisRatio);
  let safeAB = select(1.0, max(absAR, 0.05), absAR > 0.0);

  let tintRgb = select(vec3<f32>(intensity), highlightRgb * intensity * HIGHLIGHT_BOOST, highlightActive);
  let tintW = select(p.colorIndex, -1.0, highlightActive);
  out.instanceTint = vec4<f32>(tintRgb, tintW);

  // Invisibility cull: galaxies whose folded intensity falls below this
  // threshold contribute imperceptibly to the additive HDR target, so
  // we emit a degenerate clip position (outside the [-1, 1] NDC cube)
  // and let the rasteriser drop the primitive before any fragment work.
  // Pick fragment shares this vertex stage; the cull is suppressed
  // in the pick pass so the user can still click galaxies the visual
  // pass has dimmed below the additive-HDR contribution threshold.
  let INVISIBILITY_THRESHOLD = 0.005;
  if (intensity < INVISIBILITY_THRESHOLD && !inPickPass) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }

  // Pick exclusion: while a structure is focused, its non-members must not
  // be hit-testable — clicking dimmed-out galaxies would fight the
  // isolation.  focusMult is exactly 1.0 for members and at rest, and
  // below 1.0 only for a non-member under an active focus, so this fires
  // precisely on the galaxies the visual pass is fading away.  The pick
  // pass binds the live focus buffer (the visual pass and pick share it);
  // at rest blend == 0 makes focusMult 1.0 for everything, so picking is
  // unaffected.
  if (inPickPass && focusMult < FOCUS_PICK_EXCLUDE_BELOW) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }

  // Forward the per-instance packed identity to 'fsPick'.
  // The visual 'fs' ignores this field.
  out.instanceIdx = myPacked;

  // Pack the ellipse-mask parameters: the pre-baked (cos, sin) of the
  // position-angle rotation — computed once at upload in
  // 'derivePointRecord' (negation for the east-of-north →
  // screen-UV convention already folded in), so neither this stage nor
  // the fragment pays any trig — alongside 'safeAB' (computed above
  // from 'p.axisRatio'). See the 'ellipse' field comment in io.wesl for
  // why these three values share one @location.
  out.ellipse = vec3<f32>(p.paCosSin, safeAB);

  return out;
}
