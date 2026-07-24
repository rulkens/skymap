// points/io.wesl — shared structs for the points pipeline.
//
// This file is the 'interface' module of the points renderer family. It
// declares the three structs that ALL points entry points (vs, fs,
// fsPick) need to agree on byte-for-byte:
//
//   - 'Uniforms'   — the @group(0) @binding(0) uniform buffer layout.
//   - 'PerVertex'  — the per-instance vertex attributes.
//   - 'VSOut'      — the vertex-to-fragment interface.
//
// ## Why a separate io module
//
// Originally everything lived in a single 'points.wesl' that contained
// both '@fragment fn fs' (visual) and '@fragment fn fsPick' (picking).
// The PointRenderer compiled the whole module and selected the 'fs'
// entry point; the PickRenderer did the same and selected 'fsPick'.
// This worked but had two costs we wanted to remove:
//
//   1. Each pipeline pulled in the OTHER fragment's code via the same
//      shader module — the WGSL compiler dropped the unused entry
//      point but only after a full parse + lower pass.
//   2. The two pipelines were textually coupled. A change to 'fs'
//      forced re-validation of the pick path (and vice-versa) even
//      though the two paths are conceptually independent.
//
// Splitting into io + vertex + colorFragment + pickFragment lets each
// pipeline build a strictly-smaller shader module from disjoint
// fragment sources. The vertex stage IS still shared (one source file,
// imported by both renderers), but each renderer compiles its OWN
// vertex GPUShaderModule — so the WebGPU 'auto' bind-group-layout
// trap (auto-derived layouts are pipeline-specific identities; sharing
// across pipelines fails the 'group-equivalent' check) is sidestepped
// structurally rather than worked around at the bind-group construction
// site.
//
// ## Why bindings live in the consuming files, not here
//
// WESL has no global state — a binding declaration like
// '@group(0) @binding(0) var<uniform> u: Uniforms' is a module-local
// declaration, not an exportable symbol. Importing 'u' across modules
// is not supported. The skymap project's lib/ files prove the same
// point: 'lib/camera.wesl' exposes 'CameraUniforms' + 'worldToClip'
// but the binding '@group(0) @binding(0) var<uniform> u' is declared
// fresh in every renderer that uses it. We follow that pattern here:
// vertex.wesl, colorFragment.wesl each declare '@group(0) @binding(0)
// var<uniform> u: Uniforms' with IDENTICAL layout numbers. WGSL is
// fine with multiple files declaring the same binding so long as the
// layout matches — and 'Uniforms' is imported from this single
// authoritative place, so the layout cannot drift between consumers.
//
// pickFragment.wesl declares NO bindings — its fragment body only
// reads VSOut fields, so the @group(0) / @group(1) bindings only need
// to appear in the vertex stage that actually reads them. WebGPU's
// pipeline layout still auto-derives both bind-group layouts because
// the SHARED vertex stage references them — see pickRenderer.ts for
// the matching per-source bind-group construction.

import package::lib::camera::CameraUniforms;

// ── Uniforms layout (CameraUniforms-prefixed) ──────────────────────
//
// The first 80 bytes are the shared 'CameraUniforms' prefix from
// 'lib/camera.wesl' (viewProj + viewportPx + two reserved pad slots).
// Embedding it as a named member 'cam' rather than inlining viewProj
// + viewport keeps the cross-renderer audit story explicit: every
// renderer's first uniform field is now 'cam: CameraUniforms', and
// every projection call goes through 'worldToClip(u.cam, p)'.
//
// ## Byte layout (canonical)
//
//   offset 0   : cam: CameraUniforms (80 B; viewProj + viewportPx + 2 pads)
//   offset 80  : selectedPacked      (u32)
//   offset 84  : _pad0               (u32; sourceCode lives in @group(2) source)
//   offset 88  : pointSizePx         (f32)
//   offset 92  : brightness          (f32)
//   offset 96  : camPosWorld         (vec3<f32>)
//   offset 108 : pxPerRad            (f32)
//   offset 112 : orientationHighlight (u32)
//   offset 116 : orientationFilter    (u32)
//   offset 120 : sizeHighlight        (u32)
//   offset 124 : sizeFilter           (u32)
//   offset 128..155 : Malmquist block (biasMode, absMagLimit, apparentMagLimit,
//                     schechterMStar, schechterAlpha, schechterMLim, schechterNRef)
//   offset 156 : depthFadeEnabled    (u32)
//   offset 160..171 : pxFadeStart, pxFadeEnd, pickPass
//   offset 172..183 : galaxySbScale, galaxySbMax, galaxyFalloffStrength
//   offset 184..191 : _padU0, _padU1 (two pad words)
//   total: 192 bytes.
//
// 'src/utils/gpu/packPointUniforms.ts' is the CPU mirror of this table —
// it writes f32[43] / f32[44] / f32[45] at bytes 172 / 176 / 180 and sizes
// the buffer at UNIFORM_BYTES = 192. Any edit here is an edit there.
//
// The full historical narrative (why fields moved during the
// CameraUniforms-prefix adoption, why pointSizePx + brightness now sit
// at offsets 88/92 instead of 72/76) lives in the git history of
// points.wesl prior to this split — see the commit that introduced
// 'cam: CameraUniforms' as the first member.

struct Uniforms {
  // Shared camera prefix — viewProj for clip-space projection and
  // viewportPx for the px→clip conversion in 'vs'. All renderer-
  // specific scalars live AFTER this 80-byte block.
  cam: CameraUniforms,

  // The currently-selected point packed as '(sourceCode << 27) | localIdx',
  // or '0xFFFFFFFFu' when nothing is selected. The points pipeline does
  // not read this field — the selection ring is drawn by the dedicated
  // selectionRingLayer — but the picker mutates the slot in place to
  // suppress its own self-hit, so the byte layout must stay. See
  // 'pickRenderer.ts' SELECTED_PACKED_OFFSET.
  selectedPacked: u32,

  // Slot at offset 84: intentionally unused at the @group(0) level.
  // 'sourceCode' lives in the per-source @group(2) 'SourceUniforms'.
  _pad0: u32,

  // Desired radius of each point sprite in pixels. Larger = bigger
  // glowing halos. Typical range 2.0–8.0. The pick pass overwrites
  // this slot in-place to boost hover/click hit-radius (see
  // 'pickRenderer.ts' POINT_SIZE_OFFSET).
  pointSizePx: f32,

  // Global brightness multiplier in [0, 1]. Lets the UI dim/brighten
  // all points without re-uploading point data.
  brightness: f32,

  // World-space camera position in Mpc. Used by the vertex stage to
  // compute the per-galaxy distance, which feeds the apparent-pixel-
  // size calculation. WGSL gives 'vec3<f32>' an alignment of 16 — so
  // this field starts at offset 96 (16-byte boundary) and consumes 12
  // bytes of payload + 4 bytes of trailing padding before 'pxPerRad'.
  camPosWorld: vec3<f32>,

  // Pixels-per-radian for the current viewport + camera FOV combination,
  // pre-computed CPU-side as 'viewport.y / (2 · tan(fovY / 2))'.
  pxPerRad: f32,

  // ── Provenance-audit block (two axes × (highlight, filter)) ─────────
  //
  // Each of the two provenance axes says whether a galaxy's value was
  // MEASURED or ESTIMATED by a deterministic fallback. The estimated
  // flag rides the sign bit of the axis's per-vertex attribute:
  // 'axisRatio < 0.0' for orientation, 'radiusMpc < 0.0' for size (the
  // magnitude comes back through abs()).
  //
  // '*Highlight' is a u32 boolean (0 / 1): when 1, the vertex stage
  // replaces the ramp colour of ESTIMATED galaxies on that axis with a
  // flat audit colour (magenta for orientation, green for size, amber
  // when both fire).
  //
  // '*Filter' is a tri-state cull code, not a boolean:
  //   0 = all       — draw both measured and estimated.
  //   1 = measured  — cull galaxies estimated on this axis.
  //   2 = estimated — cull galaxies measured on this axis.
  // A single code rather than two booleans because 'hide measured' and
  // 'hide estimated' together would mean 'draw nothing', a state the
  // encoding should not be able to express. The two axes' filters
  // compose by AND: a galaxy survives only if it passes both.
  orientationHighlight: u32,
  orientationFilter: u32,
  sizeHighlight: u32,
  sizeFilter: u32,

  // ── Malmquist-bias correction state ─────────────────────────────────
  //
  // 'biasMode' chooses which correction the vertex/fragment stages apply:
  //   0 = none         — render every galaxy unchanged.
  //   1 = volume-limit — discard galaxies whose absolute magnitude is
  //                      fainter (numerically larger) than 'absMagLimit'.
  //   2 = 1/V_max      — weight by inverse maximum-detection volume.
  //   3 = Schechter    — reweight by the expected Schechter LF.
  //   4 = AngularReweight — re-weight by HEALPix angular completeness.
  //
  // Only 'biasMode' + 'absMagLimit' are live. The 'apparentMagLimit' /
  // 'schechter*' fields are reserved-but-unread: the Schechter / 1-over-Vmax
  // modes read their per-galaxy weights from the per-vertex 'schechterRatio'
  // + angular slots (spliced in by biasCorrectionSubsystem on the CPU), not
  // these uniforms. They stay declared only to keep 'pickPass's byte offset
  // stable; nothing writes them, no shader reads them.
  biasMode: u32,
  absMagLimit: f32,
  apparentMagLimit: f32,
  schechterMStar: f32,
  schechterAlpha: f32,
  schechterMLim: f32,
  schechterNRef: f32,
  // Per-galaxy camera-distance depth fade gate. When 1, the vertex
  // stage computes '1 / (1 + (camDist / FALLOFF_HALF)²)'; when 0 it
  // skips the gate and forwards 1.0 through. It lodges in the Malmquist
  // group's trailing slot purely for packing — it has nothing to do with
  // bias correction, and living here leaves the provenance block above a
  // contiguous 112..127 run.
  depthFadeEnabled: u32,

  // ── Procedural-disk crossfade-OUT band ──────────────────────────────
  //
  // The thumbnail subsystem's procedural-disk pass fades IN across an
  // apparent-pixel-size band [pxFadeStart, pxFadeEnd]. Without a
  // complementary fade-OUT on the points pass, both passes would be
  // fully present inside the band — a 'double-bright donut'. The
  // vertex stage folds '1 - smoothstep(start, end, apparentDiameterPx)'
  // into 'out.instanceTint.rgb', so the fragment reads no per-pixel
  // state for the crossfade.
  pxFadeStart: f32,
  pxFadeEnd: f32,
  // 0 = visual pass, 1 = pick pass.  Set in-place by pickRenderer
  // before each pick draw and reset by the next visual frame's full
  // buffer rewrite.  When 1, the vertex stage skips the procedural-
  // disk crossfade-OUT and the intensity-floor degenerate-clip cull;
  // without those gates, galaxies handed off to a procedural disk
  // would not be pickable (the disk renderer has no pick pipeline).
  pickPass: u32,

  // Physical-SB live calibration knobs (galaxy-look spike). galaxySbScale is
  // the overall HDR gain; galaxySbMax caps a compact galaxy's emitted
  // amplitude (bloom ceiling); galaxyFalloffStrength is the exponent on the
  // resolved-fraction readability falloff. Two pad words round the struct to
  // 192 bytes.
  galaxySbScale: f32,
  galaxySbMax: f32,
  galaxyFalloffStrength: f32,
  _padU0: f32,
  _padU1: f32,
};

// ─── per-instance vertex attributes ──────────────────────────────────
//
// These fields are filled from the *instance* vertex buffer — one
// record per catalog point, not one record per vertex. The numbers
// here (0, 1, 2 …) must exactly match the @location values in
// pointRenderer.ts's vertex.buffers[].attributes array. If they
// disagree the GPU silently reads garbage.

struct PerVertex {
  // World-space Cartesian position in Mpc, produced by raDecZToCartesian.
  @location(0) position: vec3<f32>,

  // Apparent magnitude. Lower = brighter (the astronomical magnitude
  // scale runs backwards).
  @location(1) magnitude: f32,

  // Rest-frame colour-ramp position in [0, 2]. K-correction and the
  // unknown-colour fallback (1.05 substitution) are already applied at
  // bake time by 'pickColourIndex'; the shader just calls 'ramp(...)'.
  @location(2) colorIndex: f32,

  // Galaxy minor/major axis ratio b/a in (0, 1] — with the SIGN BIT
  // carrying the fallback-orientation flag. Real measurements are
  // always positive; the JS-side bake negates the value for fallback
  // rows. The vertex stage recovers both pieces in one read:
  //   - 'abs(axisRatio)' for the elliptical mask shape
  //   - 'axisRatio < 0.0' for the fallback flag
  //
  // ## NaN handling (synthetic-fallback source)
  //
  // The synthetic-fallback source ships its axisRatio array filled with
  // NaN. WGSL's 'abs(NaN)' returns NaN and 'NaN < 0.0' is false, so
  // the vertex stage routes synthetic rows through the existing
  // 'axisRatio > 0 is false' round-mask path with the fallback flag clear.
  @location(3) axisRatio: f32,

  // Pre-baked (cos, sin) of the position-angle rotation, negation folded
  // in at bake time (astronomical PA is east-of-north CCW, UV-space y
  // points down, and rotating the UV is the inverse of rotating the
  // ellipse).  Replaces a per-vertex 'positionAngleDeg' + cos/sin: the
  // angle is a galaxy-static value, so paying two transcendentals for
  // all 6 vertices of every instance every frame was pure waste.
  @location(4) paCosSin: vec2<f32>,

  // Per-galaxy padded billboard radius in Mpc — equals
  // 'max(diameterKpc, 30) * 2 / 1000' baked at upload time. The 4×
  // thumbnail-footprint padding and the synthetic-fallback floor are
  // already applied; the shader reads the value directly as the
  // half-extent of the world-space quad.
  //
  // The SIGN BIT carries the fallback-diameter flag, mirroring
  // '@location(3) axisRatio'. Real padded radii are always positive; the
  // JS-side bake negates the value for rows whose diameter was a fallback
  // estimate. The vertex stage recovers both pieces in one read:
  //   - 'abs(radiusMpc)' for the billboard magnitude
  //   - 'radiusMpc < 0.0' for the fallback flag
  // 'NaN < 0.0' is false, so synthetic rows read as non-fallback.
  @location(5) radiusMpc: f32,

  // Per-galaxy 1/V_max weight for Malmquist-bias correction. Baked at
  // upload time as 'clamp((dRef / dMax(M, m_lim))³, 0, 1)'. Read by the
  // vertex shader's intensity computation, but ONLY when
  // 'u.biasMode == 2u'.
  @location(6) vMaxWeight: f32,

  // Per-galaxy Schechter density-correction ratio. Baked at upload time
  // as 'clamp(N_ref / n(d), 0, 10)' (originally a 200-step trapezoidal
  // integral evaluated per-fragment; now a single multiply). Read in
  // 'fs' only when 'u.biasMode == 3u'.
  @location(7) schechterRatio: f32,

  // Per-galaxy HEALPix angular re-weight. Baked at mode-toggle time as
  // 'clamp(medianCount / localCount, 0.1, 10)' (default 1.0). Read in
  // 'fs' only when 'u.biasMode == 4u'.
  @location(8) angularDensityWeight: f32,

  // Absolute magnitude, baked at upload from the offset-normalised
  // apparent magnitude (the same slot-3 value 'magnitude' above carries)
  // and the galaxy's distance from origin.  The Malmquist mode-1 gate
  // compares this against 'u.absMagLimit' directly — the value is
  // galaxy-static, so the old per-vertex 'distanceModulus(magnitude,
  // length(position))' spent a log10 + sqrt per invocation recomputing
  // a constant.
  @location(9) absMag: f32,

  // Physical surface-brightness amplitude, baked at upload: relative
  // luminosity (vs the per-catalog mean absolute magnitude) over
  // (diameter / 30 kpc)^2. Drives the HDR intensity so intrinsically bright
  // / compact galaxies emit above the bloom threshold and diffuse ones stay
  // dim. Surface brightness is distance-independent; the inverse-square
  // behaviour on approach comes from the flux-conservation term in vs.
  @location(10) sbAmp: f32,
};

// ─── vertex-to-fragment interface ───────────────────────────────────
//
// VSOut is the contract between 'vs' and the two fragment entry points
// ('fs' and 'fsPick'). Both fragments declare 'in: VSOut' so the
// rasteriser interpolates the same set of fields for every fragment of
// every triangle of every billboard. WGSL permits a fragment shader to
// declare FEWER inputs than the vertex shader outputs (unused fields
// are silently dropped by the linker), so 'fsPick' only reads
// 'in.uv' + 'in.instanceIdx'.

struct VSOut {
  // Clip-space position, used by the rasteriser for perspective divide
  // and viewport mapping.
  @builtin(position) clip: vec4<f32>,

  // The quad corner in [-1, +1]² — doubles as a UV coordinate for the
  // circle/ellipse falloff.
  @location(0) uv: vec2<f32>,

  // Per-instance colour modulator, packed into one vec4.
  // .rgb = intensity in the normal case — a brightness MODULATOR, not a
  //        finished colour. The ramp colour is deliberately absent:
  //        'colorFragment.wesl' evaluates 'rampRadial' per fragment (see
  //        'lib/colorIndex.wesl'), because the ramp's argument depends on
  //        the fragment's radius within the billboard and so cannot be a
  //        flat per-instance constant.
  //        With a provenance highlight active, .rgb is instead the FINAL
  //        colour: the flat audit hue times intensity times a boost.
  //        intensity already folds in the magnitude clamp, brightness
  //        slider, Malmquist mode-2/3/4 weights, depth fade, and the
  //        procedural-disk crossfade-out.
  // .w   = colorIndex — the galaxy's rest-frame, K-corrected colour
  //        index, forwarded unchanged from 'PerVertex.colorIndex' so the
  //        fragment stage has the ramp's 't' argument without needing
  //        its own attribute slot.
  //        Its SIGN is the highlight signal. 'pickColourIndex' clamps every
  //        real colour index to [0, 2], so a negative value is a free,
  //        unambiguous sentinel meaning 'a provenance highlight is active,
  //        .rgb is already final, skip the ramp'. Same sign-bit-as-flag
  //        idiom as 'PerVertex.axisRatio' and 'PerVertex.radiusMpc'. Signal
  //        rather than a fifth varying because varying slots cost ~1.5 ms
  //        on this fragment-bound pass (see the note at the end of this
  //        file) while a sign test costs nothing.
  // Flat-interpolated — all 6 vertices of an instance share the value.
  @location(1) @interpolate(flat) instanceTint: vec4<f32>,

  // Packed (source, localIdx) identity used by 'fsPick' to write the
  // pick texture. Flat-interpolated because integers can't be linearly
  // interpolated, and all 6 vertices of one instance share the same value.
  @location(2) @interpolate(flat) instanceIdx: u32,

  // Per-instance ellipse-mask parameters, packed into one vec3 at one
  // @location. A WGSL '@location' is always a 4-component slot on the
  // wire — a lone vec2 or a lone f32 at its own location still consumes
  // a full interpolator, wasting the remaining 2 or 3 components.
  // Packing all three ellipse-mask values into one vec3 therefore costs
  // exactly one location — the same as a vec2 alone would — while
  // giving the fragment everything the mask transform needs.
  //
  //   .xy = pre-computed (cos, sin) of the position-angle rotation.
  //         Computed once per primitive in 'vs' instead of per fragment,
  //         saving millions of trig calls per frame.
  //   .z  = safeAB, the validated ellipse minor-axis ratio (clamped to
  //         [0.05, 1.0], defaulted to 1.0 for invalid/NaN inputs).
  //
  // The grouping isn't arbitrary packing for its own sake: all three
  // values are consumed together, in the same few lines of the
  // elliptical-mask transform in 'colorFragment.wesl' (rotate the UV by
  // (cos, sin), then divide by the minor-axis ratio) — they're one
  // conceptual unit ('the ellipse this billboard is masked to'), so one
  // field name covering all three reads truer than two unrelated fields
  // that happened to share a struct.
  @location(3) @interpolate(flat) ellipse: vec3<f32>,
};

// ── Why VSOut has no fifth @location for the colour gradient ─────────
//
// A radial warm-core / cool-rim colour gradient (see 'lib/colorIndex.
// wesl') needs the fragment to know both the galaxy's colour index and
// its position within the billboard — naively that argues for
// forwarding two pre-evaluated endpoint colours and mixing by radius,
// which would need a fifth @location.
//
// That would cost real, measured ground: a fifth @location measured
// +1.5 ms on this pass (~21%) at the full-survey scenario, against a
// per-fragment saving of one sqrt and one fused multiply-add — each
// additional @location is a per-fragment parameter fetch from tile
// memory paid for every covered pixel, and this pass is
// fragment/blend-bound with billboards covering most of the screen at
// the large tiers (see docs/RENDERER.md).
//
// The fix is not a workaround, it's the correct simplification: 'ramp'
// is piecewise linear in its saturated parameter, so mixing two
// endpoint lookups is algebraically identical to ONE lookup at the
// mixed argument (the identity is spelled out in 'lib/colorIndex.wesl').
// Given that, the fragment can call 'rampRadial(colorIndex, r)' itself
// with no precomputed endpoints at all — it only needs 'colorIndex'
// (now riding in 'instanceTint.w', a slot that was already allocated
// and had room) and 'r' (already computed from 'uv' for the elliptical
// mask). Evaluating the ramp per fragment costs one 'ramp' call per
// covered pixel — MUCH cheaper than a whole interpolator slot, and
// unavoidable regardless: the argument depends on the fragment's
// radius, so this evaluation could never have stayed hoisted in the
// vertex stage even if varying budget were free. 'VSOut' therefore
// still has exactly the 4 locations (0-3) it had before the gradient
// existed.
