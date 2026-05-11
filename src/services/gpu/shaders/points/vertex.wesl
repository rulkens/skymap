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
// modules. We re-declare 'u' and 'cloud' here using the structs
// imported from 'points/io.wesl', so the layout numbers (and the
// underlying byte layout via the imported 'Uniforms' / 'CloudUniforms'
// structs) are guaranteed to match the colorFragment + pickFragment
// counterparts. WGSL accepts the same '@group/@binding' pair appearing
// in multiple compiled modules so long as the layout is identical;
// importing a single authoritative struct definition makes drift
// structurally impossible.
//
// pickFragment.wesl declares no bindings of its own — the SHARED
// vertex stage already references both '@group(0)' and '@group(1)',
// so the pick pipeline's auto-derived layout still picks them up.

import package::points::io::Uniforms;
import package::points::io::PerVertex;
import package::points::io::VSOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::cloudFade::CloudUniforms;
import package::lib::colorIndex::ramp;
import package::lib::astro::distanceModulus;
import package::lib::selectionEncoding::packSelection;

// ── @group(0) — per-frame uniforms ──────────────────────────────────
//
// Same binding numbers as colorFragment.wesl. Both renderers' uniform
// buffers carry the layout described in 'points/io.wesl::Uniforms';
// the visual pass writes the full struct each frame, and the pick pass
// re-uses the same buffer (with a few in-place mutations to suppress
// the selection halo and boost the pick floor — see pickRenderer.ts).
@group(0) @binding(0) var<uniform> u: Uniforms;

// ── @group(1) — per-source CloudFade uniforms ───────────────────────
//
// Each loaded survey has its OWN @group(1) bind group whose buffer
// carries CloudFade's 16-byte struct (opacity + sourceCode). Per-source
// bind groups dodge the 'queue.writeBuffer' race entirely (different
// uniform buffers per source means writes to one don't race against
// draws against another). The vertex stage reads 'cloud.sourceCode'
// to compose '(sourceCode << 27u) | instance_index' for the selection-
// halo + pick-output paths.
@group(1) @binding(0) var<uniform> cloud: CloudUniforms;

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

  // Recover the per-instance packed identity now so both the early-out
  // and the main path can share one source of truth. Bits 27..31 = the
  // 5-bit 'cloud.sourceCode' (this draw's survey, set per-source via
  // the @group(1) bind group); bits 0..26 = the GPU's
  // '@builtin(instance_index)' (local 0..count-1).
  let myPacked = packSelection(cloud.sourceCode, ii);

  if (u.biasMode == 1u && absMag > u.absMagLimit) {
    var earlyOut: VSOut;
    earlyOut.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    earlyOut.uv = corner;
    earlyOut.tint = vec3<f32>(0.0);
    earlyOut.intensity = 0.0;
    earlyOut.instanceIdx = myPacked;
    earlyOut.selected = 0u;
    earlyOut.axisRatio = 1.0;
    earlyOut.paCs = 1.0;
    earlyOut.paSn = 0.0;
    earlyOut.isFallback = 0u;
    earlyOut.dMpc = dMpc;
    earlyOut.schechterRatio = 0.0;
    earlyOut.angularDensityWeight = 1.0;
    earlyOut.camDistMpc = 0.0;
    earlyOut.depthFade = 1.0;
    earlyOut.sizePx = 0.0;
    return earlyOut;
  }

  // ── SELECTION CHECK ───────────────────────────────────────────────────────
  //
  // Compare the per-instance packed identity against 'u.selectedPacked'
  // ('0xFFFFFFFFu' when nothing is selected). Each source's identity
  // range is structurally disjoint by construction (top 5 bits = source
  // code), so the comparison is a straight u32 equality.
  let isFallbackFlag = select(0u, 1u, p.axisRatio < 0.0);
  let isSelected = (myPacked == u.selectedPacked);

  // Scale the billboard 8× for the selected point so the selection ring
  // is unmistakable — even a faint, magnitude-22 galaxy gets a visible halo.
  let sizeScale = select(1.0, 8.0, isSelected);

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
  // pixel-radius screen-aligned billboard corner; we then post-multiply
  // by 'sizeScale' so the per-instance 8× halo expansion (selection
  // ring) keeps stacking on top of the base pixel size. See
  // 'lib/billboard.wesl' for the centerClip.w / viewportPx
  // cancellation derivation.
  let offset = expandBillboardScreen(u.cam, center, sizePx, corner) * sizeScale;

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
  // 'k' is the per-row 'p.kPerZ' attribute (baked at upload time per
  // source). We derive z from the position vector via Hubble's law:
  // |xyz| = c·z/H₀, so z = |xyz| / HUBBLE_DISTANCE_MPC. This matches
  // how the CPU-side raDecZToCartesian generated these positions.
  let HUBBLE_DISTANCE_MPC = 4282.749;  // c / H₀ for H₀ = 70 km/s/Mpc
  let zRedshift = length(p.position) / HUBBLE_DISTANCE_MPC;

  // Sentinel detection: colorIndex >= 100 marks 'no observed colour for
  // this survey's preferred band pair'. We skip K-correction for those
  // and substitute a fixed mid-ramp colour (1.05 ≈ pale orange-white)
  // so sentinel galaxies have a stable visually-neutral tint.
  let isUnknownColour = p.colorIndex > 100.0;
  let restColorIndex = select(p.colorIndex - p.kPerZ * zRedshift, 1.05, isUnknownColour);

  // Look up the colour for this point's *rest-frame* colour index.
  out.tint = ramp(restColorIndex);

  // ── MAGNITUDE → INTENSITY ────────────────────────────────────────────────
  //
  //   intensity = (22 - magnitude) / 8
  //
  //   magnitude 14 → 1.0   (brightest)
  //   magnitude 22 → 0.0   (faint limit)
  //
  // We clamp to [0.05, 1.0] rather than [0, 1] so that even the faintest
  // objects remain *barely* visible — a hard zero would create gaps in
  // the distribution.
  //
  // ── 1/V_max alpha modulation ─────────────────────────────────────────────
  //
  // When 'u.biasMode == 2u' (BiasMode.VMax), multiply the intensity by
  // 'p.vMaxWeight'. This dims intrinsically-bright galaxies whose
  // detectability volume V_max exceeds the reference volume V_ref — they
  // visible across a much larger slice of space than their faint
  // companions, so without the down-weighting they'd over-represent
  // themselves visually. The 'select(1.0, p.vMaxWeight, …)' keeps the
  // OTHER three modes (None, VolumeLimited, Schechter, AngularReweight)
  // unchanged.
  let vMaxAlpha = select(1.0, p.vMaxWeight, u.biasMode == 2u);
  out.intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0) * u.brightness * vMaxAlpha;

  // Forward the per-instance packed identity to 'fsPick'.
  // The visual 'fs' ignores this field.
  out.instanceIdx = myPacked;

  // Propagate the selection flag for 'fs'.
  out.selected = select(0u, 1u, isSelected);

  // Forward the fallback flag for the highlight + hide toggles in 'fs'.
  out.isFallback = isFallbackFlag;

  // Forward 'abs(axisRatio)' so the fragment stage's elliptical mask
  // uses the unsigned magnitude. Negative values would make the
  // existing 'axisRatio > 0.0' validity check trip on every fallback
  // row and collapse the ellipse mask to a circle.
  out.axisRatio = abs(p.axisRatio);

  // Pre-compute cos/sin of the position-angle rotation so the fragment
  // stage skips the trig and just reads these flat-interpolated values.
  // We negate the rotation here because astronomical PA is east-of-north
  // (CCW on sky) but our UV-y points down on screen, AND because
  // rotating the UV is the inverse of rotating the ellipse.
  let paRad = -p.positionAngleDeg * 3.14159265 / 180.0;
  out.paCs = cos(paRad);
  out.paSn = sin(paRad);

  // Forward origin-relative distance for future distance-dependent
  // fragment effects (currently unused in 'fs').
  out.dMpc = dMpc;

  // Forward the per-galaxy Schechter density ratio. The intensity above
  // already folded it into 'out.intensity' for mode 3 — forwarding it
  // through VSOut keeps the attribute available to the fragment in case
  // future tweaks (e.g. tint modulation) want to read it. With
  // @interpolate(flat) the GPU writes the value once per primitive.
  out.schechterRatio = p.schechterRatio;

  // Forward the per-galaxy HEALPix angular re-weight (default 1.0).
  out.angularDensityWeight = p.angularDensityWeight;

  // Forward camera-relative distance for fragment-stage depth effects.
  out.camDistMpc = distanceMpc;

  // Pre-compute the depth-fade multiplier here so the fragment doesn't
  // re-derive it per pixel. Curve: '1 / (1 + (camDist / FALLOFF_HALF)²)'.
  // The 1000 Mpc half-distance + the 'u.depthFadeEnabled' gate are
  // resolved here so the fragment stage gets a single multiplier.
  let FALLOFF_HALF_MPC = 1000.0;
  let camDistRel = distanceMpc / FALLOFF_HALF_MPC;
  let depthFadeRaw = 1.0 / (1.0 + camDistRel * camDistRel);
  out.depthFade = select(1.0, depthFadeRaw, u.depthFadeEnabled == 1u);

  // Forward the per-instance billboard radius in screen-pixels so the
  // fragment stage can fade points-pass alpha across the procedural-
  // disk crossfade band.
  out.sizePx = sizePx;

  return out;
}
