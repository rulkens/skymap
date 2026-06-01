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
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::colorIndex::ramp;
import package::lib::astro::distanceModulus;
import package::lib::selectionEncoding::packSelection;
import package::lib::orientation::diskAxes;
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
// Each loaded survey has its OWN @group(2) bind group whose buffer
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
  // Project the point's 3-D world position to clip space via the
  // shared 'worldToClip' helper from 'lib/camera.wesl'.
  let center = worldToClip(u.cam, p.position);

  // Fetch the quad corner for this vertex (in [-1, +1]²).
  let corner = quadCorner(vi);

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
  // 27..31 = 5-bit 'source.sourceCode' (this draw's survey, set per-
  // source via the @group(2) bind group); bits 0..26 = the GPU's
  // '@builtin(instance_index)' (local 0..count-1).
  let myPacked = packSelection(source.sourceCode, ii);

  let isFallbackFlag = select(0u, 1u, p.axisRatio < 0.0);

  // Vertex-side cull: galaxies gated out by Malmquist mode 1 (volume-
  // limited) or by realOnlyMode (hide fallback orientations) emit a
  // degenerate clip position so all 6 vertices of the quad land outside
  // the NDC cube and the rasteriser drops the primitive — no fragment
  // work, no pick-texture write.
  let malmquistGated = u.biasMode == 1u && absMag > u.absMagLimit;
  let realOnlyGated = u.realOnlyMode == 1u && isFallbackFlag == 1u;
  if (malmquistGated || realOnlyGated) {
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
  let sizePx = max(u.pointSizePx, apparentPxRadius);

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
  // pass skips this fade so disk-sized galaxies still write into the
  // pick texture (the procedural-disk renderer has no pick pipeline).
  let apparentDiameterPx = sizePx * 0.5;
  let inPickPass = u.pickPass == 1u;
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
  // scaled by the smoothstep blend. Collapses to 1.0 when no POI is
  // focused (blend == 0), so the visual pass is unchanged at rest.
  let intensity = clamp((22.0 - p.magnitude) / 8.0, source.intensityFloor, 1.0)
    * u.brightness
    * vMaxAlpha
    * schechterMult
    * angularMult
    * depthFadeMult
    * crossfadeOut
    * focusAlphaMultiplier(p.position, focus);

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

  // Tell fsPick which mask shape to use.  See io.wesl::VSOut for what
  // each value means.
  let isDiskHandoff = apparentDiameterPx >= u.pxFadeStart;
  out.isDiskHandoff = select(0u, 1u, isDiskHandoff);

  // Projected disk basis for the pick-mode ellipse mask.  Only emit
  // the projection work when we're actually in the pick pass AND in
  // the disk-handoff regime; both gates avoid wasted clip-space
  // projections on the millions of far-field point sprites the visual
  // pass draws every frame.  See io.wesl::VSOut for the math the
  // fragment side performs on these two vectors.
  if (inPickPass && isDiskHandoff) {
    // Clamp cosI at 0.05 (matches procedural-disk renderer) so an
    // edge-on disk's minor axis doesn't collapse to a degenerate line
    // and the fragment's matrix inverse stays well-conditioned.
    let cosI = max(safeAB, 0.05);
    let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
    // Positive paRad (east-of-north on the celestial sky) — opposite
    // sign from the point sprite's screen-aligned 'paRotation', which
    // negates because it rotates UV in the inverse direction.  Here
    // we want the actual world-space axis.
    let paRadWS = p.positionAngleDeg * 3.14159265 / 180.0;
    let axes = diskAxes(p.position, paRadWS, cosI, sinI);
    let majorWS = axes.major;
    let minorWS = axes.minor;

    // Project the disk's outer-edge tips (centre ± radiusMpc · axis)
    // and take the NDC delta from the projected centre.  Multiply by
    // viewportPx · 0.5 to convert NDC → pixels, then divide by the
    // billboard's half-extent in pixels so the fragment can test
    // against unit UV.
    let majorTipClip = worldToClip(u.cam, p.position + p.radiusMpc * majorWS);
    let minorTipClip = worldToClip(u.cam, p.position + p.radiusMpc * minorWS);
    let baseNDC = vec2<f32>(center.x, center.y) / center.w;
    let majorNDC = vec2<f32>(majorTipClip.x, majorTipClip.y) / majorTipClip.w;
    let minorNDC = vec2<f32>(minorTipClip.x, minorTipClip.y) / minorTipClip.w;
    let halfViewport = u.cam.viewportPx * 0.5;
    let billboardHalfPx = max(sizePx * 0.5, 1.0);
    out.pickMajorBillboard = ((majorNDC - baseNDC) * halfViewport) / billboardHalfPx;
    out.pickMinorBillboard = ((minorNDC - baseNDC) * halfViewport) / billboardHalfPx;
  } else {
    out.pickMajorBillboard = vec2<f32>(0.0, 0.0);
    out.pickMinorBillboard = vec2<f32>(0.0, 0.0);
  }

  return out;
}
