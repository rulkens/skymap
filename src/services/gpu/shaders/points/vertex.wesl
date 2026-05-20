// points/vertex.wesl — billboard vertex stage for the points pipeline.
//
// Shared by both renderers: the visual PointRenderer compiles this
// alongside 'colorFragment.wesl' for the additive-blended display
// pass; the offscreen PickRenderer compiles it alongside
// 'pickFragment.wesl' for the r32uint picking pass. Both pipelines
// build their OWN GPUShaderModule from this same source — never share
// a module across pipelines, because WebGPU's 'auto' bind-group-
// layout system gives each pipeline its own pipeline-local layout
// identity and sharing modules tempts you into sharing layouts that
// don't actually pass the 'group-equivalent' compatibility check.
//
// ## Why the bindings are declared here, not in io.wesl
//
// WESL has no global state — '@group(N) @binding(M) var<uniform> X'
// is a module-local declaration that cannot be exported across
// modules. We re-declare 'u' here using the structs imported from
// 'points/io.wesl', so the layout numbers (and the underlying byte
// layout via the imported 'Uniforms' struct) are guaranteed to match
// the colorFragment + pickFragment
// counterparts. WGSL accepts the same '@group/@binding' pair appearing
// in multiple compiled modules so long as the layout is identical;
// importing a single authoritative struct definition makes drift
// structurally impossible.
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
// carries SourceUniforms's 16-byte struct (sourceCode + 12 bytes pad).
// Per-source bind groups dodge the 'queue.writeBuffer' race entirely
// (different uniform buffers per source means writes to one don't
// race against draws against another). The vertex stage reads
// 'source.sourceCode' to compose '(sourceCode << 27u) | instance_index'
// for the pick-output path.
@group(2) @binding(0) var<uniform> source: SourceUniforms;

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
  // We want each galaxy's billboard to occupy its real angular footprint on
  // screen but never to vanish below 'u.pointSizePx' (the far-field 'still
  // detectable as a glowing dot' floor).
  //
  //   radius_Mpc = (diameterKpc / 2) * 4 / 1000 = diameterKpc * 2 / 1000
  //
  // The 4× padding factor matches ThumbnailRenderer's
  // 'sizeWorld = (diameterKpc / 1000) * 4', so the soft glowing dot and
  // the textured thumbnail occupy the same world-space footprint and
  // the load-fade transition is seamless. The 'select' clamps zero/NaN
  // diameters back to the project-wide 30-kpc default.
  let safeDiameterKpc = select(30.0, p.diameterKpc, p.diameterKpc > 0.0);
  let GALAXY_RADIUS_MPC = safeDiameterKpc * 2.0 / 1000.0;
  let toGalaxy = p.position - u.camPosWorld;
  let distanceMpc = length(toGalaxy);
  // Guard distanceMpc against 0 so we don't divide-by-zero when the camera
  // is parked exactly on a galaxy (test fixture path; not a real scenario).
  let safeDist = max(distanceMpc, 0.001);
  let apparentPxRadius = (GALAXY_RADIUS_MPC / safeDist) * u.pxPerRad;
  let sizePx = max(u.pointSizePx, apparentPxRadius);

  // ── PIXEL-SIZE-IN-CLIP-SPACE CONVERSION ──────────────────────────────────
  //
  // 'expandBillboardScreen' computes the clip-space delta for a 'sizePx'-
  // pixel-radius screen-aligned billboard corner. See 'lib/billboard.wesl'
  // for the centerClip.w / viewportPx cancellation derivation.
  let offset = expandBillboardScreen(u.cam, center, sizePx, corner);

  var out: VSOut;

  // Add the screen-space offset to the projected centre.
  // Only X and Y move; Z and W stay unchanged.
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Pass the quad corner through as UV; used in the fragment shader to
  // compute distance from the billboard centre.
  out.uv = corner;

  // ── K-CORRECTION (observed → rest-frame colour) ──────────────────────────
  //
  //   colour_rest ≈ colour_obs − k · z
  //
  // 'k' is the per-survey 'source.kPerZ' uniform (set once at upload
  // time from data/colourIndex.ts). We derive z from the position
  // vector via Hubble's law: |xyz| = c·z/H₀, so z = |xyz| /
  // HUBBLE_DISTANCE_MPC. Matches the CPU-side raDecZToCartesian.
  let HUBBLE_DISTANCE_MPC = 4282.749;  // c / H₀ for H₀ = 70 km/s/Mpc
  let zRedshift = length(p.position) / HUBBLE_DISTANCE_MPC;

  // Sentinel detection: colorIndex >= 100 marks 'no observed colour for
  // this survey's preferred band pair'. We skip K-correction for those
  // and substitute a fixed mid-ramp colour (1.05 ≈ pale orange-white)
  // so sentinel galaxies have a stable visually-neutral tint.
  let isUnknownColour = p.colorIndex > 100.0;
  let restColorIndex = select(p.colorIndex - source.kPerZ * zRedshift, 1.05, isUnknownColour);

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
  let FALLOFF_HALF_MPC = 1000.0;
  let camDistRel = distanceMpc / FALLOFF_HALF_MPC;
  let depthFadeRaw = 1.0 / (1.0 + camDistRel * camDistRel);
  let depthFadeMult = select(1.0, depthFadeRaw, u.depthFadeEnabled == 1u);

  // Crossfade-out against the procedural-disk pass. ThumbnailRenderer
  // fades IN across [pxFadeStart, pxFadeEnd] (apparent-pixel diameter);
  // we fade OUT with the complementary smoothstep so the additive HDR
  // contribution stays constant per galaxy through the band.
  let apparentDiameterPx = sizePx * 0.5;
  let crossfadeOut = 1.0 - smoothstep(u.pxFadeStart, u.pxFadeEnd, apparentDiameterPx);

  let intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0)
    * u.brightness
    * vMaxAlpha
    * schechterMult
    * angularMult
    * depthFadeMult
    * crossfadeOut;

  // Bake the K-corrected ramp colour, the magenta highlight, and the
  // intensity scalar straight into out.shaded.rgb. .w carries safeAB —
  // pre-computed ellipse-mask coefficient, defaulted to 1.0 (circle)
  // for invalid/NaN axisRatio (synthetic-fallback rows). 'abs(NaN) >
  // 0.0' is false, so the select branch is the correct gate.
  let highlightActive = u.highlightFallback == 1u && isFallbackFlag == 1u;
  let highlightTint = select(vec3<f32>(1.0), vec3<f32>(1.0, 0.3, 1.0), highlightActive);
  let absAR = abs(p.axisRatio);
  let safeAB = select(1.0, max(absAR, 0.05), absAR > 0.0);
  out.shaded = vec4<f32>(ramp(restColorIndex) * highlightTint * intensity, safeAB);

  // Invisibility cull: galaxies whose folded intensity falls below this
  // threshold contribute imperceptibly to the additive HDR target, so
  // we emit a degenerate clip position (outside the [-1, 1] NDC cube)
  // and let the rasteriser drop the primitive before any fragment work.
  // Pick fragment shares this vertex stage, so culled galaxies also
  // become non-pickable — acceptable since they were never visible. A
  // selected-but-culled galaxy still gets its UI ring from the dedicated
  // selectionRingPass, which runs independently of this pipeline.
  let INVISIBILITY_THRESHOLD = 0.005;
  if (intensity < INVISIBILITY_THRESHOLD) {
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
