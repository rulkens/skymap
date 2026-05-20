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
//   offset 112 : highlightFallback   (u32)
//   offset 116 : realOnlyMode        (u32)
//   offset 120 : depthFadeEnabled    (u32)
//   offset 124 : _pad4               (u32)
//   offset 128..159 : Malmquist block (biasMode, absMagLimit, ...)
//   offset 160..175 : pxFadeStart, pxFadeEnd, _padFade0, _padFade1
//   total: 176 bytes.
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
  // selectionRingPass — but the picker mutates the slot in place to
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

  // ── Task 15: orientation-visibility toggles ─────────────────────────
  //
  // u32 booleans (0 / 1) controlling how the fragment shader treats
  // galaxies whose orientation came from the deterministic fallback
  // rather than a real photometric measurement. The fallback flag
  // itself rides on the sign bit of the per-vertex 'axisRatio'.
  highlightFallback: u32,
  realOnlyMode: u32,
  // Per-galaxy camera-distance depth fade gate. When 1, the vertex
  // stage computes '1 / (1 + (camDist / FALLOFF_HALF)²)'; when 0 it
  // skips the gate and forwards 1.0 through.
  depthFadeEnabled: u32,
  _pad4: u32,

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
  // The four 'schechter*' fields are written PER SOURCE between draw
  // calls. The φ* normalisation drops out of the ratio 'N_ref / n(d)',
  // so it doesn't need a uniform slot.
  biasMode: u32,
  absMagLimit: f32,
  apparentMagLimit: f32,
  schechterMStar: f32,
  schechterAlpha: f32,
  schechterMLim: f32,
  schechterNRef: f32,
  _pad5: u32,

  // ── Procedural-disk crossfade-OUT band ──────────────────────────────
  //
  // The thumbnail subsystem's procedural-disk pass fades IN across an
  // apparent-pixel-size band [pxFadeStart, pxFadeEnd]. Without a
  // complementary fade-OUT on the points pass, both passes would be
  // fully present inside the band — a 'double-bright donut'. The
  // vertex stage folds '1 - smoothstep(start, end, apparentDiameterPx)'
  // into 'out.intensity', so the fragment reads no per-pixel state for
  // the crossfade.
  pxFadeStart: f32,
  pxFadeEnd: f32,
  _padFade0: f32,
  _padFade1: f32,
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

  // Survey-specific colour index (e.g. SDSS g−r, GLADE B−J, 2MRS J−K).
  // Negative → blue, positive → red. Sentinel value '>= 100' marks
  // 'no observed colour for this survey'.
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

  // Position angle in degrees, [0, 180). East-of-north convention; we
  // negate before applying because UV-space y points down on screen.
  @location(4) positionAngleDeg: f32,

  // Per-galaxy physical diameter in kiloparsecs. Drives the apparent-
  // size billboard radius. v4 binary format guarantees a finite
  // positive value (real measurement or 30-kpc fallback).
  @location(5) diameterKpc: f32,

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
};

// ─── vertex-to-fragment interface ───────────────────────────────────
//
// VSOut is the contract between 'vs' and the two fragment entry points
// ('fs' and 'fsPick'). Both fragments declare 'in: VSOut' so the
// rasteriser interpolates the same set of fields for every fragment of
// every triangle of every billboard. WGSL permits a fragment shader to
// declare FEWER inputs than the vertex shader outputs (unused fields
// are silently dropped by the linker), so 'fsPick' only reads
// 'in.uv' + 'in.instanceIdx' even though the struct carries far more.

struct VSOut {
  // Clip-space position, used by the rasteriser for perspective divide
  // and viewport mapping.
  @builtin(position) clip: vec4<f32>,

  // The quad corner in [-1, +1]² — doubles as a UV coordinate for the
  // circle/ellipse falloff.
  @location(0) uv: vec2<f32>,

  // Per-instance colour + ellipse-mask coefficient packed together.
  // .rgb = colourIndex-ramp lookup with magenta highlight folded in.
  // .w   = pre-computed safeAB (axis ratio clamped to [0.05, 1.0],
  //        defaulted to 1.0 for invalid/NaN inputs). Fragment uses .w
  //        directly to squash the elliptical mask. Packing the scalar
  //        into the unused alpha channel of the tint slot frees the
  //        location axisRatio used to occupy.
  // Flat-interpolated — all 6 vertices of an instance share the value.
  @location(1) @interpolate(flat) tint: vec4<f32>,

  // Per-instance brightness with every per-instance modulator folded in:
  // magnitude-based intensity × brightness slider × vMax (mode 2) ×
  // Schechter (mode 3) × angular reweight (mode 4) × depth-fade
  // (camera-distance falloff). Fragment multiplies in only per-pixel
  // terms (Gaussian falloff, procedural-disk fade, source fade).
  @location(2) @interpolate(flat) intensity: f32,

  // Packed (source, localIdx) identity used by 'fsPick' to write the
  // pick texture. Flat-interpolated because integers can't be linearly
  // interpolated, and all 6 vertices of one instance share the same value.
  @location(3) @interpolate(flat) instanceIdx: u32,

  // Pre-computed (cos, sin) of the position-angle rotation. Computed
  // once per primitive in 'vs' instead of per fragment, saving millions
  // of trig calls per frame. Packed into a vec2 at one location.
  @location(4) @interpolate(flat) paRotation: vec2<f32>,

};
