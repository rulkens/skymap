// points/vertex.wesl — billboard vertex stage for the points pipeline.
//
// Shared by both renderers: the visual PointRenderer compiles this
// alongside 'colorFragment.wesl' for the additive-blended display
// pass; the offscreen PickRenderer compiles it alongside
// 'pickFragment.wesl' for the r32uint picking pass. Both pipelines
// build their OWN GPUShaderModule from this same source — never share
// a module across pipelines, because WebGPU's 'auto' bind-group-layout
// system gives each pipeline its own pipeline-local layout identity.
//
// ## Why the bindings are declared here, not in io.wesl
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X' is
// a module-local declaration that cannot be exported across modules. We
// re-declare 'u' here using the structs imported from 'points/io.wesl',
// so the layout numbers (and the underlying byte layout via the
// imported 'Uniforms' struct) are guaranteed to match the colorFragment
// + pickFragment counterparts. WGSL accepts the same '@group/@binding'
// pair in multiple compiled modules so long as the layout is identical;
// importing one authoritative struct makes drift structurally impossible.
//
// pickFragment.wesl declares no bindings of its own — this vertex
// module references '@group(0)' (Uniforms) and '@group(2)' (per-source
// SourceUniforms). The colorFragment module additionally declares
// '@group(1)' (FadeUniforms). PickRenderer binds a no-op fade buffer
// at '@group(1)' so its pipeline layout matches the visual pipeline.

import package::points::io::Uniforms;
import package::points::io::PerVertex;
import package::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::lensing::lensTerm;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::colorIndex::ramp;
import package::lib::astro::distanceModulus;
import package::lib::selectionEncoding::packSelection;
import package::lib::focusUniforms::FocusUniforms;
import package::lib::focusUniforms::focusAlphaMultiplier;

// ── @group(0) — per-frame uniforms ──────────────────────────────────
//
// Same binding numbers as colorFragment.wesl. Both renderers' uniform
// buffers carry the layout described in 'points/io.wesl::Uniforms';
// the visual pass writes the full struct each frame, and the pick pass
// re-uses the same buffer (with a small in-place mutation to boost the
// pick floor — see pickRenderer.ts).
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── @group(1) — FadeUniforms (declared but unused at vertex stage) ─
//
// We don't re-declare FadeUniforms here because the vertex stage
// never reads it — only the fragment stage multiplies fade.opacity
// into alpha. The pipeline layout's @group(1) slot is still present
// (the fragment module declares it), so the bind group built by the
// renderer is valid; the vertex module simply doesn't reference the
// binding.

// ── @group(2) — per-source SourceUniforms ──────────────────────────
//
// Each loaded galaxy catalog has its OWN @group(2) bind group whose buffer
// carries SourceUniforms's 16-byte struct (sourceCode + intensityFloor
// + falloffHalfMpc + 4 bytes pad — see lib/sourceUniforms.wesl).
// Per-source bind groups dodge the 'queue.writeBuffer' race entirely
// (different uniform buffers per source means writes to one don't
// race against draws against another). The vertex stage reads
// 'source.sourceCode' to compose '(sourceCode << 27u) | instance_index'
// for the pick-output path.
@group(2) @binding(0) var<uniform> source: SourceUniforms;

// ── @group(3) — cluster-focus uniform (single shared binding) ───────
//
// One POI is focused at a time, so this is a single global binding (not
// per-source like fade). 'focusAlphaMultiplier' folds a membership-based
// dim into 'intensity'; at blend == 0 it returns 1.0 (no-op when nothing
// is focused). See lib/focusUniforms.wesl for the math.
@group(3) @binding(0) var<uniform> focus: FocusUniforms;

// Peak lensing magnification clamp. A point source on the caustic has
// infinite μ; a real (extended) source saturates at ~θ_E / source-size.
// We have no source size, so we cap |μ| here to keep an on-axis galaxy
// from blowing out the additive HDR target. See lib/lensing.wesl.
const LENS_MU_MAX: f32 = 10.0;

// ─── vertex stage ─────────────────────────────────────────────────────
//
// The vertex shader runs once per (instance, vertex) pair.
//   @builtin(vertex_index)    cycles 0..5 within each instance (per-vertex)
//   @builtin(instance_index)  the 0-based local index of this catalog point
//   p: PerVertex              carries the per-instance data (position/mag/ci)

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  p: PerVertex,
) -> VSOut {
  // Gravitational lensing (multi-cluster). Each source is drawn as TWO
  // quads when the lens pass is active: vertex_index 0..5 carry the summed
  // primary image, 6..11 the dominant lens's inner counter-image. We loop
  // over every in-view cluster lens: the primary accumulates the deflection
  // of all of them (the weak-shear field between clusters + each ring's
  // outward push), while the counter image is rendered only for the lens
  // with the largest δ/β on this source (the one closest to forming a ring).
  // 'lensMu' folds the dominant lens's magnification into intensity below.
  // The deflection preserves the source's distance from the eye, so the
  // apparent-size and depth-fade math below (which read p.position's length)
  // are unaffected — only the projected screen direction changes. See
  // lib/lensing.wesl.
  let imageKind = select(0u, 1u, vi >= 6u);
  let toSrc = p.position - u.camPosWorld;
  let dS = length(toSrc);

  var primaryOffset = vec3<f32>(0.0, 0.0, 0.0);
  var lensMu = 1.0;
  var bestRatio = 0.0;
  var bestBeta = 0.0;
  var bestDelta = 0.0;
  var bestDirLens = vec3<f32>(0.0, 0.0, 1.0);
  var bestTangent = vec3<f32>(0.0, 0.0, 0.0);
  var hasDominant = false;

  if (u.lensEnabled == 1u && dS > 1e-4) {
    let dirSrc = toSrc / dS;
    for (var i = 0u; i < u.lensCount; i = i + 1u) {
      let term = lensTerm(u.camPosWorld, u.lenses[i], dirSrc, dS, u.lensMode, u.lensScaleRadius);
      if (term.valid == 0u) {
        continue;
      }
      // Primary: accumulate this lens's outward push (δ along +tangent).
      primaryOffset = primaryOffset + term.tangent * term.delta;
      // Primary brightness tracks the strongest single-lens magnification.
      lensMu = max(lensMu, min(1.0 + term.delta / term.beta, LENS_MU_MAX));
      // Dominant lens for the counter image: largest δ/β (nearest a ring).
      let ratio = term.delta / term.beta;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestBeta = term.beta;
        bestDelta = term.delta;
        bestDirLens = term.dirLens;
        bestTangent = term.tangent;
        hasDominant = true;
      }
    }
  }

  // Assemble this quad's lensed position + validity from the accumulators.
  // Lens disabled / no foreground lens → identity primary, culled counter.
  var lensedPos = p.position;
  var lensValid = select(1u, 0u, imageKind == 1u);
  if (u.lensEnabled == 1u && dS > 1e-4) {
    if (imageKind == 0u) {
      // Primary: source direction rotated by the SUMMED deflection.
      let dirImage = normalize(toSrc + primaryOffset * dS);
      lensedPos = u.camPosWorld + dirImage * dS;
      lensValid = 1u;
    } else if (hasDominant) {
      // Dominant lens's counter image: θ = δ − β on the −tangent side,
      // valid only when the source sits inside that lens's Einstein radius.
      let thetaC = bestDelta - bestBeta;
      if (thetaC > 0.0) {
        let dirImage = bestDirLens * cos(thetaC) - bestTangent * sin(thetaC);
        lensedPos = u.camPosWorld + dirImage * dS;
        lensMu = min(bestDelta / bestBeta - 1.0, LENS_MU_MAX);
        lensValid = 1u;
      }
    }
  }

  // Project the (possibly lensed) world position to clip space via the
  // shared 'worldToClip' helper from 'lib/camera.wesl'.
  let center = worldToClip(u.cam, lensedPos);

  // Fetch the quad corner for this vertex (in [-1, +1]²).  The second
  // quad (vi 6..11) reuses the same six corner offsets.
  let corner = quadCorner(vi % 6u);

  // ── Malmquist-bias gating (volume-limited mode) ──────────────────────────
  //
  // Compute the galaxy's *absolute* magnitude from its observed apparent
  // magnitude + cosmological distance from origin:
  //
  //     M = m  -  5 · log10(d_Mpc)  -  25
  //
  // 'discard' is fragment-stage only; the vertex stage gates by emitting
  // a clip-space coordinate outside the unit cube, so all 6 vertices of
  // the gated quad land at NDC (2,2,2) and the GPU drops the primitive.
  let dMpc = length(p.position);
  let absMag = distanceModulus(p.magnitude, dMpc);

  // Recover the per-instance packed identity for the pick path. Bits
  // 27..31 = 5-bit 'source.sourceCode' (this draw's galaxy catalog, set per-
  // source via the @group(2) bind group); bits 0..26 = the GPU's
  // '@builtin(instance_index)' (local 0..count-1).
  let myPacked = packSelection(source.sourceCode, ii);

  let isFallbackFlag = select(0u, 1u, p.axisRatio < 0.0);

  // Vertex-side cull: galaxies gated out by Malmquist mode 1 (volume-
  // limited) or by realOnlyMode (hide fallback orientations) emit a
  // degenerate clip position so all 6 vertices of the quad land outside
  // the NDC cube and the rasteriser drops the primitive — no fragment
  // work, no pick-texture write.  A counter-image quad for a source
  // outside the Einstein radius (lensed.valid == 0u) is culled the same
  // way: most of the doubled quads collapse here, so the lens pass adds
  // fragments only for the handful of images that actually form.
  let malmquistGated = u.biasMode == 1u && absMag > u.absMagLimit;
  let realOnlyGated = u.realOnlyMode == 1u && isFallbackFlag == 1u;
  let lensCulled = lensValid == 0u;
  if (malmquistGated || realOnlyGated || lensCulled) {
    var earlyOut: VSOut;
    earlyOut.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    earlyOut.uv = corner;
    earlyOut.shaded = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    earlyOut.instanceIdx = myPacked;
    earlyOut.paRotation = vec2<f32>(1.0, 0.0);
    return earlyOut;
  }

  // ── APPARENT-SIZE BILLBOARD RADIUS ───────────────────────────────────────
  //
  // Each galaxy's billboard occupies its real angular footprint on
  // screen but never vanishes below 'u.pointSizePx' (the far-field
  // 'still detectable as a glowing dot' floor). The per-instance
  // 'p.radiusMpc' carries the already-padded world-space half-extent —
  // bake site applied the 4× thumbnail-footprint padding and the
  // synthetic-fallback floor, so the shader reads it directly.
  let toGalaxy = p.position - u.camPosWorld;
  let distanceMpc = length(toGalaxy);
  // Guard distanceMpc against 0 so we don't divide-by-zero when the camera
  // is parked exactly on a galaxy (test fixture path; not a real scenario).
  let safeDist = max(distanceMpc, 0.001);
  let apparentPxRadius = (p.radiusMpc / safeDist) * u.pxPerRad;
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

  // Quad corner as UV; the fragment uses it for distance-from-centre.
  out.uv = corner;

  // p.colorIndex is the rest-frame, sentinel-substituted ramp position
  // — K-correction and the unknown-colour fallback already happened
  // CPU-side in pickColourIndex. The shader just looks the value up.

  // ── MAGNITUDE → INTENSITY, with every per-instance modulator folded in ──
  //
  //   intensity = clamp((22 - magnitude) / 8, 0.05, 1.0)   // mag 14 → 1.0,
  //                                                          mag 22 → 0.05
  //               × u.brightness                            // global slider
  //               × vMaxWeight     (mode 2: 1/V_max)
  //               × schechterRatio (mode 3: Schechter LF)
  //               × angularReweight (mode 4: HEALPix)
  //               × depthFade      (camera-distance falloff)
  //               × crossfadeOut   (procedural-disk handoff band)
  //
  // All six factors are per-instance constants, so the fragment reads
  // out.shaded.rgb directly — no per-pixel multiply.
  let vMaxAlpha = select(1.0, p.vMaxWeight, u.biasMode == 2u);
  let schechterMult = select(1.0, p.schechterRatio, u.biasMode == 3u);
  let angularMult = select(1.0, p.angularDensityWeight, u.biasMode == 4u);

  // Depth-fade: 1 / (1 + (camDist/FALLOFF_HALF)²), gated by depthFadeEnabled.
  // Half-distance is per-source ('source.falloffHalfMpc') so sparse far-field
  // catalogs (Milliquas) can effectively disable the fade by carrying a very
  // large value while bulk galaxy catalogs keep the original ~1000 Mpc tuning.
  let camDistRel = distanceMpc / source.falloffHalfMpc;
  let depthFadeRaw = 1.0 / (1.0 + camDistRel * camDistRel);
  let depthFadeMult = select(1.0, depthFadeRaw, u.depthFadeEnabled == 1u);

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

  // Per-source intensity floor ('source.intensityFloor'). Lower floors
  // reduce per-galaxy contribution to the additive HDR target in dense
  // regions (tames center saturation); higher floors keep faint objects
  // visible (Milliquas at high z).
  // Cluster-focus dim: non-members of the focused POI fade toward 0.08,
  // scaled by the smoothstep blend. Collapses to exactly 1.0 when no POI
  // is focused (blend == 0) AND for members (mix(1.0, 1.0, blend)), so a
  // value below 1.0 uniquely marks a non-member of an active focus — used
  // both for the visual dim here and the pick exclusion below.  The dim
  // folds into the same intensity the invisibility cull tests, so a faded
  // non-member that drops under the perceptibility floor is culled rather
  // than left to pile up additively in a dense field.
  let focusMult = focusAlphaMultiplier(p.position, focus);
  // Lensing magnification: each SIS image's flux scales by |μ| (1.0 when
  // the lens is off or the source is unlensed). This brightens the primary
  // near the ring and dims the counter-image toward the Einstein radius —
  // the physically correct brightness, not equal-weighted copies. A
  // strongly-demagnified counter-image falls below INVISIBILITY_THRESHOLD
  // below and is culled, saving the fragment work.
  let intensity = clamp((22.0 - p.magnitude) / 8.0, source.intensityFloor, 1.0)
    * u.brightness
    * vMaxAlpha
    * schechterMult
    * angularMult
    * depthFadeMult
    * crossfadeOut
    * focusMult
    * lensMu;

  // Bake the K-corrected ramp colour, the magenta highlight, and the
  // intensity scalar straight into out.shaded.rgb. .w carries safeAB —
  // pre-computed ellipse-mask coefficient, defaulted to 1.0 (circle)
  // for invalid/NaN axisRatio (synthetic-fallback rows). 'abs(NaN) >
  // 0.0' is false, so the select branch is the correct gate.
  let highlightActive = u.highlightFallback == 1u && isFallbackFlag == 1u;
  let highlightTint = select(vec3<f32>(1.0), vec3<f32>(1.0, 0.3, 1.0), highlightActive);
  let absAR = abs(p.axisRatio);
  let safeAB = select(1.0, max(absAR, 0.05), absAR > 0.0);
  out.shaded = vec4<f32>(ramp(p.colorIndex) * highlightTint * intensity, safeAB);

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
  if (inPickPass && focusMult < 1.0) {
    out.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
  }

  // Forward the per-instance packed identity to 'fsPick'.
  // The visual 'fs' ignores this field.
  out.instanceIdx = myPacked;

  // Pre-compute cos/sin of the position-angle rotation so the fragment
  // stage skips the trig and just reads these flat-interpolated values.
  // We negate the rotation here because astronomical PA is east-of-north
  // (CCW on sky) but our UV-y points down on screen, AND because
  // rotating the UV is the inverse of rotating the ellipse.
  let paRad = -p.positionAngleDeg * 3.14159265 / 180.0;
  out.paRotation = vec2<f32>(cos(paRad), sin(paRad));

  return out;
}
