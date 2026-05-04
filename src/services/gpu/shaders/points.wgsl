// ─── points.wgsl — billboarded point sprites for the sky map ──────────────────
//
// BIG PICTURE
// -----------
// We have up to millions of catalog points (galaxies / quasars), each with a
// 3-D world-space position, a visual magnitude, and a colour index. We want to
// draw each one as a soft glowing circle on the screen at a fixed *pixel* size,
// regardless of how far away it is in world space — a "billboard" or "point
// sprite".
//
// Strategy: one instanced draw call.
//
//   draw(vertexCount=6, instanceCount=N)
//
// The GPU launches 6*N invocations of the vertex shader. For each instance i
// (one catalog point) it runs the vertex shader 6 times, once per corner of a
// two-triangle quad (a "billboard quad"):
//
//     3──2   ← triangle 2: verts 3,4,5
//     │╲ │
//     │ ╲│
//     0──1   ← triangle 1: verts 0,1,2
//
// The quad lives in *screen space*: we project the point's world position to
// clip space, then nudge each corner by a fixed pixel offset — so the quad
// always appears the same size on screen no matter how far the point is.
//
// The fragment shader then discards the quad's rectangular corners (turning it
// into a circle) and applies a Gaussian-like intensity falloff from the centre.
//
// WGSL → JS CONNECTION
// --------------------
// This shader is loaded by both PointRenderer (Task 10) and PickRenderer (Task 16),
// which each select a different fragment entry point from this same module:
//   - PointRenderer uses `vs` + `fs`   → visual additive-blended render
//   - PickRenderer  uses `vs` + `fsPick` → offscreen r32uint picking pass
//
// Both pipelines share the same vertex stage (`vs`) and the same shader module.
// Having two fragment entry points in one file avoids duplicating the vertex
// stage logic (billboard math, magnitude→intensity, colour ramp) while allowing
// each pass to write to its own render-target format.
//
// The class:
//   1. Calls `device.createShaderModule({ code: wgslSource })` with this text.
//   2. Creates a `GPURenderPipeline` that references the `vs` and `fs` (or
//      `fsPick`) entry points defined below.
//   3. Uploads a `Uniforms` struct (viewProj, viewport, pointSizePx, brightness)
//      into a uniform buffer and binds it to @group(0) @binding(0).
//   4. Uploads per-point data (position, magnitude, colorIndex) into a vertex
//      buffer configured for *instance stepping* (one record per point), while
//      @builtin(vertex_index) steps per-vertex (0..5 within each instance).
//   5. Calls `passEncoder.draw(6, pointCount)` to kick off the draw.

// ─── uniforms ─────────────────────────────────────────────────────────────────

// A "bind group" is a numbered slot (0, 1, 2 …) that you attach resources —
// uniform buffers, textures, samplers — to before a draw call. The GPU's
// pipeline declares what it *expects* in each slot; the JavaScript side
// provides the actual buffer/texture. This decoupling lets you swap resources
// (e.g. upload a new uniform buffer each frame) without rebuilding the pipeline.
//
// @group(0) @binding(0) means: bind group slot 0, binding index 0.
// On the JS side, PointRenderer creates a GPUBindGroupLayout with one entry
// at {binding:0, visibility:VERTEX|FRAGMENT, buffer:{type:'uniform'}}, builds
// a GPUBindGroup pointing at the Uniforms buffer, and calls
// passEncoder.setBindGroup(0, bindGroup) before drawing.

struct Uniforms {
  // The combined view-projection matrix (4×4 f32, 64 bytes).
  // Uploaded by PointRenderer from computeViewProj() (see orbitCamera.ts).
  // WGSL uniform buffers follow std140-like alignment: mat4x4<f32> is 64 bytes,
  // naturally aligned to 16 bytes — no padding needed before it.
  viewProj: mat4x4<f32>,

  // Canvas dimensions in physical pixels (after DPR scaling from device.ts).
  // Stored as a vec2<f32> because we divide by it below; integer division
  // would lose precision. Alignment: vec2<f32> = 8 bytes, aligned to 8.
  viewport: vec2<f32>,

  // Desired radius of each point sprite in pixels. Larger = bigger glowing
  // halos. Typical range 2.0–8.0. Alignment: f32 = 4 bytes.
  pointSizePx: f32,

  // Global brightness multiplier in [0, 1]. Lets the UI dim/brighten all
  // points without re-uploading point data. Alignment: f32 = 4 bytes.
  // (The vec2 above took 8 bytes, so offset so far is 64+8+4+4 = 80 — still
  // within a single 256-byte uniform block and no padding gaps needed here.)
  brightness: f32,

  // The 0-based index of the currently selected point, or 0xFFFFFFFFu when
  // nothing is selected. When a vertex's instance index matches this value,
  // the billboard is rendered larger (3× scale) with a ring/halo effect.
  //
  // SENTINEL DESIGN: Using 0xFFFFFFFFu (max u32) as "nothing selected" means
  // the selection check never accidentally matches a real point.  Point
  // indices start at 0, so we would need 4 billion points before this
  // sentinel could collide — far beyond any real catalog.
  //
  // OFFSET STABILITY: The four preceding fields (vec2 + f32 + f32 = 16 bytes)
  // bring the running offset to 80 bytes, and `selectedIndex` sits there.
  // The picker (`pickRenderer.ts`) writes `selectedIndex` directly using a
  // hard-coded byte offset of 80 — adding fields *after* `selectedIndex`
  // (like `instanceIdOffset` below) is therefore safe; adding any field
  // *before* it would silently break the picker.
  selectedIndex: u32,

  // Per-source instance-ID offset, written by `PointRenderer.draw` once per
  // source-specific draw call. Multi-source rendering issues N draws (one per
  // loaded survey), each producing instance indices that start at 0 inside
  // its own draw. The pick texture, however, identifies points by a *global*
  // index that runs continuously across all surveys (so JS can use the value
  // as an index into the merged point arrays). `fsPick` therefore writes
  // `instanceIdx + 1u + instanceIdOffset` instead of `instanceIdx + 1u`,
  // shifting each survey's IDs into a unique slice of the global index space.
  //
  // Why update only this 4-byte slot per draw call (rather than the whole
  // struct)? `device.queue.writeBuffer` schedules a CPU→GPU copy whose cost
  // scales with the bytes written. We only need to change 4 bytes between
  // draws (everything else — viewProj, viewport, etc. — is identical), so
  // writing 96 bytes would waste ~95% of the bandwidth on data that did not
  // change.
  instanceIdOffset: u32,

  // Two u32 padding words to keep `selectedIndex` (offset 80) and
  // `instanceIdOffset` (offset 84) on the same 16-byte vec4 slot as the
  // _pad0/_pad1 below.  Required because the next member (`camPosWorld`,
  // a vec3<f32>) has alignment 16, so the struct would otherwise insert
  // implicit padding here anyway — naming the bytes makes the JS-side
  // upload obvious.
  _pad0: u32,
  _pad1: u32,

  // ── APPARENT-SIZE BILLBOARD SIZING (added Task: galaxy disc sizing) ──────
  //
  // World-space camera position in Mpc.  Used by the vertex stage to compute
  // the per-galaxy distance, which feeds the apparent-pixel-size calculation
  // below.  WGSL gives `vec3<f32>` an alignment of 16 — so this field starts
  // at offset 96 (the previous _pad0/_pad1 brought us to a 16-byte boundary)
  // and consumes 12 bytes of payload + 4 bytes of trailing padding before
  // `pxPerRad`.
  //
  // Why a uniform and not a per-vertex attribute?  The camera position is the
  // same for every instance in a frame.  Per-vertex storage would burn ~10 MB
  // for SDSS to redundantly record one vec3 per galaxy — a uniform is the
  // right tool for "per-frame, all-instances" data.
  camPosWorld: vec3<f32>,

  // Pixels-per-radian for the current viewport + camera FOV combination,
  // pre-computed CPU-side as `viewport.y / (2 · tan(fovY / 2))`.  Multiplying
  // an angular size (radians) by this scalar yields screen pixels — the
  // standard pinhole-camera relation, just packaged for cheap shader use.
  //
  // We pass it pre-divided rather than passing fovY and recomputing per
  // vertex because `tan` is one of the more expensive intrinsics on mobile
  // GPUs and the result is frame-constant.
  pxPerRad: f32,

  // ── Task 15: orientation-visibility toggles ────────────────────────────
  //
  // u32 booleans (0 / 1) controlling how the fragment shader treats
  // galaxies whose orientation came from the deterministic fallback rather
  // than a real photometric measurement. The fallback flag itself is baked
  // per-vertex into the high bit of `globalInstanceIdx` (see PerVertex doc).
  //
  // - `highlightFallback`: when 1, multiply the tint of fallback rows by
  //   magenta `(1.0, 0.3, 1.0)` — a quick visual scan of which surveys
  //   have real orientation coverage.
  // - `realOnlyMode`: when 1, `discard` fallback fragments entirely so the
  //   user can see only galaxies with measured (b/a, PA). Useful for
  //   verifying the cross-match coverage as `npm run fetch-2mass-xsc` and
  //   `npm run fetch-hyperleda` populate their caches.
  //
  // Two trailing u32s round the struct to a 16-byte boundary (vec4 slot).
  highlightFallback: u32,
  realOnlyMode: u32,
  _pad3: u32,
  _pad4: u32,

  // ── Malmquist-bias correction state (Task 2 of malmquist-bias plan) ─────
  //
  // `biasMode` chooses which correction the vertex stage applies:
  //   0 = none         — render every galaxy unchanged.
  //   1 = volume-limit — discard galaxies whose absolute magnitude is
  //                      fainter (numerically larger) than `absMagLimit`.
  //   2 = 1/V_max      — Task 3: weight by inverse maximum-detection
  //                      volume; needs `apparentMagLimit` and per-row
  //                      flux-limit data.
  //   3 = Schechter    — Task 4: reweight by the expected Schechter
  //                      luminosity function `phi(M; M*, alpha)`.
  //
  // Modes 2 + 3 are reserved here so we don't have to grow the uniform
  // buffer again when Tasks 3 + 4 land — the shader fields are inert for
  // now (the JS side writes 0 / sentinel values), but their presence keeps
  // the byte layout stable across the three-task arc.
  //
  // Byte offsets (from the start of the uniform buffer):
  //   biasMode          → 128
  //   absMagLimit       → 132
  //   apparentMagLimit  → 136
  //   schechterMStar    → 140
  //   schechterAlpha    → 144
  //   _pad5/_pad6/_pad7 → 148, 152, 156   (round struct to 160 = 10 × 16)
  //
  // The pad triple is required because we add 5 × 4 = 20 bytes of payload
  // and WGSL uniform structs must be 16-byte aligned at their tail — so
  // we round up to the next 16-byte boundary (32 bytes added in total).
  biasMode: u32,
  absMagLimit: f32,
  apparentMagLimit: f32,
  schechterMStar: f32,
  schechterAlpha: f32,
  _pad5: u32,
  _pad6: u32,
  _pad7: u32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

// ─── vertex attributes ────────────────────────────────────────────────────────

// These fields are filled from the *instance* vertex buffer — the buffer that
// holds one record per catalog point, not one record per vertex.
//
// On the JS side the pipeline descriptor's `vertex.buffers` array will contain
// an entry like:
//
//   { arrayStride: 20,             // 3×f32 (pos) + 1×f32 (mag) + 1×f32 (ci) = 20 bytes
//     stepMode: 'instance',        // advance one record per *instance*, not per vertex
//     attributes: [
//       { shaderLocation: 0, offset:  0, format: 'float32x3' },  // position
//       { shaderLocation: 1, offset: 12, format: 'float32'   },  // magnitude
//       { shaderLocation: 2, offset: 16, format: 'float32'   },  // colorIndex
//     ] }
//
// The numbers here (0, 1, 2) must exactly match the @location values below.
// If they disagree the GPU silently reads garbage — one of the most common
// hard-to-debug WebGPU mistakes.

struct PerVertex {
  // World-space Cartesian position in Mpc, produced by raDecZToCartesian()
  // (see coords.ts). Uploaded once when the catalog loads; never changes.
  @location(0) position: vec3<f32>,

  // Apparent magnitude from SDSS. Lower = brighter (the astronomical
  // magnitude scale runs backwards). SDSS galaxies range roughly 14–22.
  @location(1) magnitude: f32,

  // SDSS g−r colour index. Negative → blue (hot stars / quasars);
  // positive → red (cool stars / old galaxies). Typical range −0.5 to +1.5.
  @location(2) colorIndex: f32,

  // Pre-baked GLOBAL instance index across all loaded surveys.
  //
  // Why bake this rather than compute it on the GPU from `instance_index +
  // u.instanceIdOffset`?  Because `instanceIdOffset` lives in a uniform
  // buffer the JS side has to overwrite per-source-draw, and WebGPU
  // sequences `queue.writeBuffer` calls on the queue: every
  // `writeBuffer(offset_X)` between draws within a single submit completes
  // BEFORE any draw runs, so all draws read the *last* offset written.
  // This racing-uniform pattern silently misroutes selection halos and pick
  // IDs for every source except the last drawn.
  //
  // Baking the global index per instance at upload time sidesteps the race
  // entirely — each vertex carries its own ID, no uniform updates needed
  // between draws.  It costs 4 bytes per instance (~10 MB for SDSS); the
  // alternative — separate command-encoder + submit per source — would
  // multiply per-frame overhead by N for no real cost saving.
  //
  // Task 15 reuses the high bit (0x80000000) as a fallback-orientation
  // flag — set at upload time when the row's (b/a, PA) values match the
  // deterministic `fallbackOrientation` output.  The vertex stage strips
  // that bit before exposing the canonical 0..N-1 index downstream, so
  // ~31 bits remain for the index proper (≈ 2 B points — comfortably
  // beyond any catalog we'll load).
  @location(3) globalInstanceIdx: u32,

  // Per-row K-correction coefficient (units: per unit redshift z).
  //
  // Used by `vs` to convert observed colour to rest-frame: each survey
  // measures a different colour pair with a different sensitivity to z,
  // so the K-correction strength varies per row rather than being a
  // global shader constant:
  //   - SDSS u−g    →  k ≈ 3.0/z (steep optical bandpass shift)
  //   - GLADE B−J   →  k ≈ 1.0/z (modest, B straddles a Balmer break)
  //   - 2MRS  J−K   →  k ≈ 0.0/z (NIR is nearly redshift-invariant at z<0.1)
  // and the JS-side upload writes 0 alongside the colorIndex sentinel for
  // rows whose source-specific colour pair isn't measurable, so the
  // sentinel branch in `vs` doesn't need to special-case kPerZ.
  @location(4) kPerZ: f32,

  // Galaxy minor/major axis ratio b/a in (0, 1]. Used by the fragment
  // shader to squash the unit-circle UV mask into an ellipse before the
  // radial cutoff — a face-on disk (b/a = 1) renders as the original
  // round point, an edge-on disk (b/a = 0.2) renders as a thin streak.
  @location(5) axisRatio: f32,
  // Position angle in degrees, [0, 180). Rotates the squashed ellipse
  // around the billboard centre. East-of-north convention; we negate
  // before applying because UV-space y points down on the screen.
  @location(6) positionAngleDeg: f32,
  // Per-galaxy physical diameter in kiloparsecs.  Drives the apparent-size
  // billboard radius below — a 100-kpc giant elliptical at 50 Mpc subtends
  // ~6× the angular footprint of a 30-kpc default disk, and the renderer
  // now reflects that.  v4 binary format guarantees a finite positive
  // value (real measurement or DEFAULT_GALAXY_DIAMETER_KPC = 30 fallback)
  // in every row.
  @location(7) diameterKpc: f32,
};

// ─── vertex-to-fragment interface ─────────────────────────────────────────────

struct VSOut {
  // @builtin(position) is the clip-space position WebGPU uses for
  // rasterisation. After the vertex shader returns, the GPU performs the
  // *perspective divide*: it divides xyz by w to get NDC (Normalised Device
  // Coordinates), then maps to pixel coordinates for fragment shading.
  @builtin(position) clip: vec4<f32>,

  // The quad corner in [-1, +1]² — doubles as a UV coordinate for the circle
  // falloff. The centre is (0,0); the four corners are at radius √2 ≈ 1.41.
  @location(0) uv: vec2<f32>,

  // Pre-computed colour for this point (from the ramp function below).
  // Interpolated across the quad by the rasteriser — but since all 6 vertices
  // of one instance share the same tint, there is no visible interpolation.
  @location(1) tint: vec3<f32>,

  // Combined brightness: magnitude-based intensity × global brightness knob.
  @location(2) intensity: f32,

  // The 0-based index of the catalog point (galaxy) this quad belongs to.
  //
  // Used by `fsPick` (the picking fragment entry point) to write the instance
  // ID into the r32uint pick texture. The visual `fs` entry point does NOT use
  // this field — WGSL permits unused fragment inputs without error.
  //
  // WHY @interpolate(flat)?
  // Integer attributes (u32) MUST be declared with @interpolate(flat) in WGSL.
  // Floating-point attributes interpolate across the triangle by default;
  // integers cannot be meaningfully interpolated (they'd need to be cast to
  // float, interpolated, then cast back — losing precision). `flat` tells the
  // rasteriser to use the "provoking vertex" value unchanged for every fragment,
  // which is correct here: all 6 vertices of one instance share the same index.
  @location(3) @interpolate(flat) instanceIdx: u32,

  // 1u when this instance is the selected point; 0u otherwise.
  // Flat-interpolated for the same reason as instanceIdx — it is a per-instance
  // boolean that must not be interpolated across the triangle.
  // Used by the visual `fs` to apply the ring/halo selection highlight.
  @location(4) @interpolate(flat) selected: u32,

  // Galaxy disk axis ratio b/a in (0, 1], forwarded from the per-instance
  // attribute. All 6 vertices of one billboard share the same value, so the
  // default linear interpolation is harmless — but Task 11 will read this in
  // the fragment shader to squash the UV-space mask. Kept as a regular
  // (non-flat) f32 because future tasks may want to interpolate it for
  // smooth-edge effects, and even the current "constant per instance" use
  // works fine without an explicit @interpolate.
  @location(5) axisRatio: f32,

  // Position angle (east-of-north) in degrees, [0, 180), forwarded from the
  // per-instance attribute. Same per-instance constancy as axisRatio.
  @location(6) positionAngleDeg: f32,

  // 1u when this row's orientation came from the deterministic fallback
  // (high bit of globalInstanceIdx was set at upload time); 0u for real
  // measurements. Used by the fragment shader for the highlight + hide
  // toggles. Flat-interpolated for the same reason as the other u32
  // attributes — integers can't be linearly interpolated.
  @location(7) @interpolate(flat) isFallback: u32,
};

// ─── colour ramp ──────────────────────────────────────────────────────────────

// Map SDSS g−r colour index to an RGB tint.
//
// The piecewise ramp runs: blue → white → red
//
//   t ≤ 0        → blueWhite blend from blue  (0.4, 0.6, 1.0) toward white
//   0 < t ≤ 1    → blueWhite blend — still in the blue-to-white half
//   1 < t ≤ 2    → whiteRed blend from white (1.0, 0.95, 0.8) toward red
//   t > 2        → fully red (1.0, 0.5, 0.3)
//
// Both blends share the same `s = clamp(t * 0.5, 0, 1)` parameter so that
// the transition is smooth and uses the same 0→1 interpolation range.
//
// WGSL `select(a, b, cond)` — note the argument order:
//   returns `a` when cond is FALSE, returns `b` when cond is TRUE.
// So  select(blueWhite, whiteRed, t > 1.0)
//   returns blueWhite when t ≤ 1.0, and whiteRed when t > 1.0.
// (This is the reverse of a typical ternary `cond ? b : a` — easy to get wrong.)

fn ramp(t: f32) -> vec3<f32> {
  // s goes 0→1 as t goes 0→2; clamp stops it at 0 for negatives and 1 for t>2.
  let s = clamp(t * 0.5, 0.0, 1.0);

  // Blue-to-white: hot blue (quasars, O/B stars) fading to a warm white.
  let blueWhite = mix(vec3<f32>(0.4, 0.6, 1.0), vec3<f32>(1.0, 0.95, 0.8), s);

  // White-to-red: warm white fading to cool red (M-type stars, red galaxies).
  let whiteRed  = mix(vec3<f32>(1.0, 0.95, 0.8), vec3<f32>(1.0, 0.5, 0.3), s);

  // Pick the right half of the ramp: blue-white for t ≤ 1, white-red for t > 1.
  // Remember: select(falseVal, trueVal, condition).
  return select(blueWhite, whiteRed, t > 1.0);
}

// ─── quad corner offsets ──────────────────────────────────────────────────────

// A triangle-list of 6 vertices forming one unit quad in [-1,+1]².
//
//   (-1,+1) ──── (+1,+1)
//      │   ╲  tri2 │
//      │ tri1 ╲    │
//   (-1,-1) ──── (+1,-1)
//
// triangle 1: verts 0,1,2  →  bottom-left, bottom-right, top-left
// triangle 2: verts 3,4,5  →  top-left, bottom-right, top-right
//
// Why not use an index buffer?  An index buffer would let us share the 4 unique
// corners and reference them via 6 indices — saving 2 redundant vertex shader
// invocations per quad. For our case the saving is tiny (2 out of 6 = 33% fewer
// vertex invocations, but each is extremely cheap), while index buffers add JS-
// side boilerplate (GPUBuffer creation, pipeline indexFormat declaration,
// drawIndexed call). The triangle-list approach is the simplest possible setup.

const QUAD = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0),  // 0 — bottom-left
  vec2<f32>( 1.0, -1.0),  // 1 — bottom-right
  vec2<f32>(-1.0,  1.0),  // 2 — top-left
  vec2<f32>(-1.0,  1.0),  // 3 — top-left   (repeated for triangle 2)
  vec2<f32>( 1.0, -1.0),  // 4 — bottom-right (repeated for triangle 2)
  vec2<f32>( 1.0,  1.0),  // 5 — top-right
);

// ─── vertex stage ─────────────────────────────────────────────────────────────

// The vertex shader runs once per (instance, vertex) pair.
//   @builtin(vertex_index)    cycles 0..5 within each instance (per-vertex)
//   @builtin(instance_index)  the 0-based index of this catalog point (per-instance)
//   p: PerVertex              carries the per-instance data (position/mag/ci)
//
// The two "step modes" are set on the JS side:
//   - The position/magnitude/colorIndex buffer uses stepMode:'instance' so
//     the same record is fed to all 6 vertices of one billboard quad.
//   - @builtin(vertex_index) is always per-vertex, cycling through the QUAD array.

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  p: PerVertex,
) -> VSOut {
  // Project the point's 3-D world position to clip space.
  // clip = viewProj * [x, y, z, 1]
  // After this, clip.xyz/clip.w gives the NDC position (in [-1,+1]³ for x,y;
  // [0,1] for z with WebGPU's perspectiveZO convention).
  let center = u.viewProj * vec4<f32>(p.position, 1.0);

  // Fetch the quad corner for this vertex (in [-1,+1]²).
  let corner = QUAD[vi];

  // ── Malmquist-bias gating (volume-limited mode) ──────────────────────────
  //
  // Compute the galaxy's *absolute* magnitude from its observed apparent
  // magnitude + cosmological distance from origin (the camera's true
  // distance is irrelevant — the absolute magnitude is an intrinsic
  // property of the galaxy):
  //
  //     M = m  -  5 · log10(d_Mpc)  -  25
  //
  // The `+25` term comes from the unit choice: distance modulus textbooks
  // write `M = m - 5·log10(d / 10pc) = m - 5·log10(d_pc) + 5`, and
  // log10(1 Mpc / 10 pc) = log10(1e5) = 5, so converting the distance unit
  // from parsecs to megaparsecs adds 5·5 = 25 to the additive constant.
  // Mirror of `absoluteFromApparent` in src/utils/math/distanceModulus.ts.
  //
  // WGSL has no `log10` intrinsic — only the natural log — so we divide
  // by ln(10) ≈ 2.302585093.
  //
  // ── Why a degenerate clip-space output instead of `discard`? ─────────────
  //
  // `discard` is a *fragment-stage* keyword — it tells the rasteriser to
  // throw away the current pixel.  The vertex stage has no equivalent
  // statement; it must always return a clip-space position.  The accepted
  // workaround is to emit a clip-space coordinate that lies outside the
  // unit cube ([-1, +1]³), so the GPU's clip+cull stage drops every
  // primitive that touches the vertex.  Setting `xyz = (2, 2, 2)` with
  // `w = 1` puts the post-divide NDC at (2, 2, 2) — well outside the unit
  // cube — and crucially does the same for *all 6 vertices* of the
  // billboard quad (because `p.biasMode`, `p.absMagLimit`, and `dMpc` all
  // depend only on per-instance state, every vertex of the quad makes the
  // same decision).  No fragment shader invocations get scheduled for the
  // discarded galaxy, so we save roughly the same work as a fragment-stage
  // `discard` would have.  The only wasted work is the six vertex
  // invocations themselves, which are cheap.
  //
  // We gate this on `u.biasMode == 1u` (the VolumeLimited literal in
  // src/data/biasMode.ts) so the default mode (`None == 0u`) is a single
  // u32 compare per vertex — effectively free.
  let dMpc = length(p.position);
  let LOG10 = 2.302585092994046;
  let absMag = p.magnitude - 5.0 * (log(dMpc) / LOG10) - 25.0;

  if (u.biasMode == 1u && absMag > u.absMagLimit) {
    var earlyOut: VSOut;
    earlyOut.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    earlyOut.uv = corner;
    earlyOut.tint = vec3<f32>(0.0);
    earlyOut.intensity = 0.0;
    earlyOut.instanceIdx = p.globalInstanceIdx & 0x7fffffffu;
    earlyOut.selected = 0u;
    earlyOut.axisRatio = 1.0;
    earlyOut.positionAngleDeg = 0.0;
    earlyOut.isFallback = 0u;
    return earlyOut;
  }

  // ── SELECTION CHECK ───────────────────────────────────────────────────────
  //
  // Determine whether this instance is the user-selected point.
  // `u.selectedIndex` is 0xFFFFFFFFu when nothing is selected (sentinel),
  // so this comparison is only ever true for a real selection.
  //
  // We compare against `p.globalInstanceIdx` (the per-instance baked global
  // ID) rather than the per-draw `@builtin(instance_index)` because the
  // selectedIndex coming from the picker is a GLOBAL index across all
  // surveys.  A naive comparison against the local `ii` would only match
  // when selectedIndex < SDSS.count — for any 2MRS or GLADE selection it
  // would either miss entirely OR match the wrong galaxy in the GLADE
  // draw (whose ii range happens to overlap the global selectedIndex).
  //
  // High bit of globalInstanceIdx flags a fallback orientation; mask it off
  // so the canonical 0..N-1 index is what selection/picker logic compares
  // against (the picker writes plain instance indices into selectedIndex,
  // never the masked value).
  let realIdx = p.globalInstanceIdx & 0x7fffffffu;
  let isFallbackFlag = select(0u, 1u, (p.globalInstanceIdx & 0x80000000u) != 0u);
  let isSelected = (realIdx == u.selectedIndex);

  // Scale the billboard ~8× for the selected point so the selection ring
  // is unmistakable — even a faint, magnitude-22 galaxy gets a visible halo.
  // Non-selected points keep the apparent-size radius.
  //
  // We use `select(normalSize, selectedSize, isSelected)` — WGSL's ternary.
  // Recall the argument order: select(falseValue, trueValue, condition).
  let sizeScale = select(1.0, 8.0, isSelected);

  // ── APPARENT-SIZE BILLBOARD RADIUS ───────────────────────────────────────
  //
  // We want each galaxy's billboard to occupy its real angular footprint on
  // screen — a galaxy 5 Mpc away gets a much bigger disk than one 500 Mpc
  // away — but never to vanish below `u.pointSizePx`, which acts as the
  // far-field "still detectable as a glowing dot" floor.
  //
  // A galaxy approximated as a 30-kpc-diameter disk (the project's current
  // single-diameter assumption — see galaxyDiameterKpc.ts; later tasks may
  // upgrade this to a per-galaxy value) has angular radius
  //
  //     θ ≈ (radius_kpc / 1000) / distance_Mpc      [radians]
  //       = radius_Mpc / distance_Mpc
  //
  // for the small-angle range we care about (galaxies subtend at most a
  // few degrees even when very close).  Multiplying by `u.pxPerRad`
  // converts radians to screen pixels.
  //
  // Why max(floor, apparent) rather than just apparent?  In the far field
  // (most galaxies in any frame), the apparent radius drops well below 1 px
  // and the galaxy would either alias into a single pixel or vanish.  The
  // floor preserves the "field of stars" look at large distances while
  // letting nearby galaxies grow into proper discs.  Tasks 11 (ellipse
  // mask) and 12 (3D disk planes) hook into this same disk to give the
  // billboard its inclination + PA appearance.
  //
  // Why 0.06 Mpc (= 60 kpc radius) rather than the physical 15 kpc radius?
  // Match the QuadRenderer's footprint.  The thumbnail quad uses
  // `sizeWorld = diameter_kpc * 4 / 1000 = 0.12 Mpc` total = 0.06 Mpc
  // half-extent, with the visible galaxy body filling its central ~25%
  // and a soft alpha-fade in the surrounding tail (the cutout JPEG fades
  // to transparent away from the galaxy).  Sizing the point billboard
  // identically means a galaxy doesn't visibly grow or shrink the
  // moment its thumbnail finishes loading — the soft glowing dot you
  // saw a frame earlier seamlessly becomes the textured galaxy.  Both
  // share the same Gaussian-ish falloff shape, so the transition is
  // visually continuous.  When Tasks 11-12 land, the elliptical mask
  // and 3D disk plane will use the smaller physical body within this
  // billboard — same disk shape, just rendered with real photometric
  // texture rather than the soft glow.
  // Per-galaxy radius in Mpc, derived from the per-instance diameterKpc
  // attribute.  The 4× padding factor matches QuadRenderer's
  // `sizeWorld = (diameterKpc / 1000) * 4`, so the soft glowing dot and
  // the textured thumbnail occupy the same world-space footprint and
  // the load-fade transition is seamless.  Algebra:
  //
  //   radius_Mpc = (diameterKpc / 2) * 4 / 1000 = diameterKpc * 2 / 1000
  //
  // The `select` clamps pathological zero/NaN diameters back to the
  // project-wide default — the build pipeline already guarantees a
  // finite positive value, but a corrupted .bin shouldn't black-hole
  // the whole sky.
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
  // We want the billboard to be `sizePx` pixels in radius on screen,
  // regardless of the point's clip-space depth.
  //
  // Clip space spans [-1, +1] in X and Y — a range of 2.0 in each direction.
  // To move 1 pixel right in clip space, we shift by 2/viewportWidth.
  // Similarly for Y.
  //
  // BUT clip space hasn't been perspective-divided yet. The GPU divides xyz by
  // w to get NDC. If we add a raw clip-space offset, it gets divided by w too,
  // making the apparent size shrink with distance (points farther away look
  // smaller).  This is exactly *wrong* for fixed-pixel billboards (we'd want
  // them constant on screen), so we cancel the divide by multiplying by w.
  // For our distance-dependent `sizePx`, the same cancellation still applies:
  // the math gives "this many screen pixels regardless of clip-space depth"
  // and the size variation comes from sizePx itself, not from perspective.
  //
  // ── SCREEN-ALIGNED BILLBOARD BASIS ──────────────────────────────────────
  //
  // We considered orienting each point billboard's +Y to projected
  // celestial-north (matches the quads pass's world-oriented basis), but
  // points are dots — only a few pixels wide — so any rotation as the
  // camera moves reads as visual jitter rather than a meaningful "the
  // sky rotated" cue.  The textured quads (much larger) keep the
  // world-oriented basis where the rotation is information-carrying.
  // For the bare points we therefore keep the original screen-X/+Y
  // basis: stable through camera motion, and the ellipse mask uses
  // sky-PA without any screen-vs-sky reconciliation.
  let pxToClip = vec2<f32>(2.0 / u.viewport.x, 2.0 / u.viewport.y);
  let offset   = corner * sizePx * sizeScale * pxToClip * center.w;

  var out: VSOut;

  // Add the screen-space offset to the projected centre.
  // Only X and Y move; Z and W stay unchanged (depth and perspective are unaffected).
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Pass the quad corner through as UV; used in the fragment shader to
  // compute distance from the billboard centre.
  out.uv = corner;

  // ── K-CORRECTION (observed → rest-frame colour) ──────────────────────────
  //
  // The colorIndex attribute is the *observed* colour — the difference of
  // two-band magnitudes as measured on Earth.  But cosmic expansion redshifts
  // every photon: a galaxy with rest-frame u−g = 1.5 at z = 0.3 has observed
  // u−g closer to 2.5, because what was the u-band at the source has shifted
  // into the optical and what was the g-band has shifted into the red.
  // Without correction, *every* distant galaxy would render red regardless
  // of its intrinsic colour — exactly the artifact the eye notices in a
  // wedge-style view.
  //
  // The proper correction (the "K-correction" in astronomy) depends on each
  // galaxy's spectral type and is normally computed via SED template fits.
  // We use a simple linear approximation suitable for visualisation:
  //
  //   colour_rest ≈ colour_obs − k · z
  //
  // …where the coefficient `k` is *not* a single shader-wide constant.  Each
  // survey we render uses a different colour pair, and each pair has its own
  // sensitivity to bandpass shift, so `k` lives in the per-instance vertex
  // attribute `p.kPerZ` (baked at upload time per-source on the JS side):
  //
  //   - SDSS u−g    →  k ≈ 3.0   (steep — u and g straddle the 4000 Å break)
  //   - GLADE B−J   →  k ≈ 1.0   (modest — B touches a Balmer break, J is NIR)
  //   - 2MRS  J−K   →  k ≈ 0.0   (NIR is nearly z-invariant at z < 0.1)
  //
  // Why a per-vertex attribute and not a uniform?  Same race that bit
  // `instanceIdOffset` (see the long comment on Uniforms.instanceIdOffset
  // above): WebGPU sequences `queue.writeBuffer` calls so that *all* writes
  // before a `submit` complete before any draw runs — meaning every draw
  // would read whichever value was written last, not the per-source value
  // the JS code intended for that draw.  Baking `k` into the instance buffer
  // sidesteps the race entirely; each vertex carries its own coefficient and
  // no uniform tweaking happens between per-source draws.  The cost is 4
  // bytes per instance (≈10 MB for SDSS) — well worth it for correct colour.
  //
  // The approximation is good to ~0.3 mag scatter per galaxy depending on
  // spectral type, which is acceptable for a colour ramp.
  //
  // We derive z from the position vector via Hubble's law: |xyz| = c·z/H₀,
  // so z = |xyz| / HUBBLE_DISTANCE_MPC. This matches how the CPU-side
  // raDecZToCartesian generated these positions, so the inversion is exact
  // for our linear-cosmology assumption.
  let HUBBLE_DISTANCE_MPC = 4282.749;  // c / H₀ for H₀ = 70 km/s/Mpc
  let zRedshift = length(p.position) / HUBBLE_DISTANCE_MPC;

  // Sentinel detection: the JS upload path writes colorIndex >= 100 to mark
  // "no observed colour for this survey's preferred band pair".  We skip
  // K-correction for those — there's no observed colour to correct back to
  // rest-frame — and substitute a fixed mid-ramp colour that gives sentinel
  // galaxies a stable visually-neutral tint regardless of z.  1.05 was
  // picked because it matches what an SDSS galaxy at z ≈ 0.05 with u−g = 1.2
  // would land at after K-correction — pale orange-white, the "average
  // galaxy" colour your eye expects.  See JS-side comments for the exact
  // sentinel value (currently 999).
  let isUnknownColour = p.colorIndex > 100.0;
  let restColorIndex = select(p.colorIndex - p.kPerZ * zRedshift, 1.05, isUnknownColour);

  // Look up the colour for this point's *rest-frame* u−g index. Galaxies
  // that were intrinsically blue stay blue regardless of distance; only
  // genuinely red (passive) galaxies render red.
  out.tint = ramp(restColorIndex);

  // ── MAGNITUDE → INTENSITY ────────────────────────────────────────────────
  //
  // SDSS apparent magnitudes run roughly 14 (very bright) to 22 (detection
  // limit). The formula maps this range to [0.05, 1.0]:
  //
  //   intensity = (22 - magnitude) / 8
  //
  //   magnitude 14 → (22-14)/8 = 1.0   (brightest)
  //   magnitude 22 → (22-22)/8 = 0.0   (faint limit)
  //
  // We clamp to [0.05, 1.0] rather than [0, 1] so that even the faintest
  // objects remain *barely* visible — a hard zero would make them fully
  // invisible and create confusing gaps in the distribution.
  //
  // Finally we multiply by the global brightness knob so the UI can dim/
  // brighten the entire sky without re-uploading point data.
  out.intensity = clamp((22.0 - p.magnitude) / 8.0, 0.05, 1.0) * u.brightness;

  // Propagate the GLOBAL instance index (already pre-baked across surveys
  // by pointRenderer.upload) for the pick fragment entry point (fsPick).
  // The visual `fs` entry point ignores this field entirely — WGSL silently
  // allows a fragment shader to declare fewer inputs than the vertex shader
  // outputs, as long as the @location values that *are* declared match.
  //
  // We keep this here so both fragment entry points share the same vertex stage.
  //
  // Strip the fallback flag bit so downstream consumers (fsPick) see the
  // canonical index; the fallback flag goes through `out.isFallback`.
  out.instanceIdx = realIdx;

  // Propagate the selection flag for the visual fragment entry point.
  // 1u = this instance is selected; 0u = normal point.
  out.selected = select(0u, 1u, isSelected);

  // Forward the fallback flag for the highlight + hide toggles in `fs`.
  out.isFallback = isFallbackFlag;

  // Forward the orientation attributes through to the fragment stage.
  // The visual `fs` doesn't use them yet — Task 11 will introduce the
  // ellipse mask — but plumbing them now means the fragment shader can be
  // updated in isolation without touching the vertex stage again.
  out.axisRatio = p.axisRatio;
  out.positionAngleDeg = p.positionAngleDeg;

  return out;
}

// ─── fragment stage ───────────────────────────────────────────────────────────

// The fragment shader runs once per pixel covered by a rasterised triangle.
// `in.uv` has been interpolated from the three vertices — but since our quad
// corners all share the same tint and intensity, only uv varies meaningfully.

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // ── Elliptical-mask transform ────────────────────────────────────────────
  //
  // The vertex shader hands us a UV in [-1, +1]² centred on the billboard.
  // We want to discard fragments outside an ELLIPSE oriented at PA with
  // semi-axes 1.0 (major) and axisRatio (minor). The cheapest way is to
  // rotate the UV by -PA (so PA-aligned axis becomes screen-x), then divide
  // y by axisRatio (so the unit-circle test in the rotated frame is the
  // ellipse test in the original frame), then apply the existing radial
  // cutoff.
  //
  // We negate the PA rotation because:
  //   1. Astronomical PA is measured east of north (counter-clockwise on
  //      sky), but our UV-y points down on screen — a sign flip.
  //   2. Rotating the UV is the inverse of rotating the ellipse, so the
  //      target rotation `+PA` becomes a UV rotation of `-PA`.
  //
  // Cost: 2 trig + 4 mul + 1 div per fragment — negligible against the 6
  // fragments per billboard at typical point sizes.
  let paRad = -in.positionAngleDeg * 3.14159265 / 180.0;
  let cs = cos(paRad);
  let sn = sin(paRad);
  let rotated = vec2<f32>(
    cs * in.uv.x - sn * in.uv.y,
    sn * in.uv.x + cs * in.uv.y,
  );
  // axisRatio is guaranteed > 0 by the build pipeline (fallback floor 0.3),
  // BUT the synthetic-fallback cloud (loaded when every real .bin file fails
  // to decode) ships its axisRatio array filled with NaN — that's the
  // honest sentinel for "synthetic data has no orientation".  In that
  // situation we want every billboard to render as a circle, identical to
  // pre-orientation behaviour.
  //
  // Trick: `NaN > 0.0` is false in WGSL, so the same comparison catches
  // both NaN and the (shouldn't-happen) zero/negative case.  When invalid,
  // we use safeAB = 1.0 → elliptic.y = rotated.y → circular r2 = original
  // dot(uv, uv).  When valid, we clamp at 0.05 against a hypothetical
  // pathological tiny value that would divide-blow up the y component.
  let abIsValid = in.axisRatio > 0.0;
  let safeAB = select(1.0, max(in.axisRatio, 0.05), abIsValid);
  let elliptic = vec2<f32>(rotated.x, rotated.y / safeAB);
  let r2 = dot(elliptic, elliptic);
  // ────────────────────────────────────────────────────────────────────────

  // Real-only mode: discard fallback fragments entirely. The user enabled
  // this to see ONLY galaxies for which we have measured photometric
  // orientation. Selection ring is also suppressed (a discarded fragment
  // can't render a halo) — that's fine; selection of fallback rows still
  // works at the data level.
  if (u.realOnlyMode == 1u && in.isFallback == 1u) { discard; }

  // ── SELECTION RING vs NORMAL DISK ─────────────────────────────────────────
  //
  // For the selected point we rendered a 3× larger billboard in `vs`, so the
  // UV space still spans [-1,+1]² but represents a physically bigger area.
  // We draw a hollow ring by:
  //   1. Discarding the outer region (r² > 1.0) → circular boundary.
  //   2. Discarding the inner region (r² < 0.4) → hollow centre.
  //   3. Applying a brighter colour on the ring band.
  //
  // For normal (non-selected) points we keep the original solid-disk logic.
  if (in.selected == 1u) {
    // Selection halo stays circular for a clean ring regardless of disk
    // orientation. Recompute r2 with the round dot(uv, uv) so an edge-on
    // ellipse doesn't disappear into a discarded slot when selected — a
    // very thin galaxy would otherwise have most of its halo's pixels
    // rejected by the elliptical r2 above and the ring would look broken.
    let r2_circ = dot(in.uv, in.uv);

    // Outside the outer edge of the scaled billboard — discard.
    if (r2_circ > 1.0) { discard; }

    // ── Inner disk (the point itself) ──────────────────────────────────────
    //
    // We scaled the billboard 8× in `vs`, so the original point's footprint
    // occupies the inner 1/8 in linear distance — i.e. r² ≤ (1/8)² = 1/64
    // ≈ 0.0156 in this scaled UV space. Inside that radius we render the
    // *normal* point disk so the user can still see the selected galaxy's
    // own brightness, not just the highlight ring around it.
    //
    // CRITICAL: use the ELLIPTICAL `r2` (computed above from the rotated +
    // squashed UV) here, NOT `r2_circ`. With the round mask the selected
    // galaxy's inner shape would suddenly become a perfect circle, making
    // it look like the orientation collapsed on click. The elliptical r2
    // gives us the same shape as the unselected point, just scaled 8×.
    //
    // The alpha factor `exp(-r2 * 256)` is the original `exp(-r2 * 4)`
    // remapped: at r² = 1/64, we want the same `exp(-4)` falloff the
    // unscaled point would have, so we multiply r² by 64 (= 8²) before
    // applying the original ×4 coefficient → 256.
    if (r2 < 0.0156) {
      let alpha = exp(-r2 * 256.0);
      let rgb   = in.tint * in.intensity;
      return vec4<f32>(rgb * alpha, alpha);
    }

    // ── Selection ring annulus ─────────────────────────────────────────────
    //
    // The ring band runs from √0.72 ≈ 0.85 of the billboard radius out to 1.0.
    // We map r² ∈ [0.72, 1.0] to a soft hump centred at 0.86 so the band
    // fades on both edges rather than appearing hard-clipped.
    if (r2_circ > 0.72) {
      let bandCentre = 0.86;
      let bandDist   = abs(r2_circ - bandCentre);
      let alpha      = exp(-bandDist * bandDist * 80.0);

      // Brighten the ring relative to the natural point colour. 2.5× plus a
      // constant white floor (0.7) keeps it salient even when the underlying
      // galaxy is dim. Additive blending saturates naturally toward white.
      let rgb = in.tint * (in.intensity * 2.5 + 0.7);

      return vec4<f32>(rgb * alpha, alpha);
    }

    // Gap between the inner point and the ring — fully transparent so the
    // selection is visually a "point + halo" pair rather than a giant disk.
    discard;
  }

  // ── NORMAL POINT — solid disk with Gaussian falloff (now ELLIPTICAL) ──────

  // Discard fragments outside the oriented ellipse defined by axisRatio + PA.
  // `r2` was computed from the rotated/squashed UV above, so this single
  // unit-radius test covers the elliptical mask without needing a separate
  // shape-specific check.
  if (r2 > 1.0) { discard; }

  // Gaussian-like falloff: bright at centre (r²=0 → e⁰=1), fading to e⁻⁴≈0.018
  // at the edge (r²=1). The factor 4.0 controls how tightly the glow is
  // concentrated; larger values give a sharper, more star-like point.
  let alpha = exp(-r2 * 4.0);

  // Highlight fallback rows in magenta when the toggle is on. The 0.3 in
  // the green channel keeps fallback galaxies recognisable as "data-y"
  // rather than turning them into pure UI accents — they still render at
  // their colour-ramp brightness, just shifted toward magenta.
  let highlightActive = (u.highlightFallback == 1u) && (in.isFallback == 1u);
  let tintFinal = select(in.tint, in.tint * vec3<f32>(1.0, 0.3, 1.0), highlightActive);
  // Scale the colour by the per-point intensity.
  let rgb = tintFinal * in.intensity;

  // ── PREMULTIPLIED ALPHA ──────────────────────────────────────────────────
  //
  // We output (rgb * alpha, alpha) — "premultiplied alpha" — rather than
  // (rgb, alpha). This is *required* because the canvas was configured with
  // `alphaMode: 'premultiplied'` in device.ts.
  //
  // In premultiplied alpha, the RGB channels already contain the result of
  // multiplying colour by opacity. The GPU blend equation for additive blending
  // (glowing stars that brighten each other rather than occlude) is:
  //
  //   dst.rgb = src.rgb + dst.rgb * (1 − src.a)
  //
  // When src.rgb = tint * intensity * alpha (premultiplied), and src.a = alpha,
  // this blends correctly against both the dark background and other overlapping
  // points. If we output (rgb, alpha) without the premultiplication and used the
  // same blend equation, the compositor would multiply rgb by alpha *again* when
  // compositing against the page, producing colours that are too dark.
  //
  // The additive blend mode itself is configured in the pipeline descriptor on
  // the JS side (Task 10) — specifically in the `targets[0].blend` descriptor.
  return vec4<f32>(rgb * alpha, alpha);
}

// ─── pick fragment stage ──────────────────────────────────────────────────────

// `fsPick` is the second fragment entry point in this file.  A single WGSL
// shader module can contain multiple entry points of the same stage; each
// `GPURenderPipeline` selects one via its `fragment.entryPoint` field.
//
// The pick pass renders into an `r32uint` offscreen texture (not the visible
// swap-chain texture).  Each fragment writes the *1-based* instance index of the
// catalog point whose billboard covers that pixel.  The JS side reads a single
// pixel from this texture under the cursor and converts it back to a 0-based
// point index.
//
// WHY OFFSET BY 1?
// The texture is cleared to 0 before the pass.  If we wrote `instanceIdx`
// directly, instance 0 would be indistinguishable from the cleared background.
// Instead we write `instanceIdx + 1`, so 0 always means "no hit" and any
// value ≥ 1 decodes to a valid point by subtracting 1.
//
// WHY A LARGER RADIUS (2.25 vs 1.0)?
// A forgiveness radius of 1.5× lets the user pick a point without needing to
// land exactly on its visual disk.  The visual `fs` discards fragments where
// r² > 1.0 (unit disk); `fsPick` discards fragments where r² > 2.25 (= 1.5²),
// effectively making each pick billboard 1.5× larger than the visible one.
//
// NOTE: `fsPick` writes `vec4<u32>` to @location(0), which maps to an `r32uint`
// render target.  The pipeline descriptor on the JS side declares the target
// format as 'r32uint' and no blend state (integers cannot be blended).

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // r2 = squared distance from the billboard centre in [-1, +1]² UV space.
  // The visual fs discards at r2 > 1.0 (unit disk, radius 1.0).
  // We discard at r2 > 2.25 (= 1.5²), giving a 1.5× bigger pick target.
  let r2 = dot(in.uv, in.uv);
  if (r2 > 2.25) { discard; }

  // Write instanceIdx + 1 so that background pixels (cleared to 0) are
  // distinguishable from the point at index 0 (which would also write 0
  // without the +1 offset).  The JS readback subtracts 1 to recover the
  // 0-based index, after checking that the raw value is not 0.
  //
  // The instanceIdx output here carries the GLOBAL per-instance index
  // (baked into the vertex buffer at upload time and propagated through
  // the vertex stage as `out.instanceIdx`), so each surveys's points
  // already occupy a unique slice of the global ID range without any
  // per-draw uniform tweaking.  See the `globalInstanceIdx` doc-comment in
  // the PerVertex struct for why we bake rather than compute on the GPU.
  //
  // The g/b/a channels are unused — we only read the r channel back on the
  // JS side.  Filling them with 0 keeps the output well-defined.
  return vec4<u32>(in.instanceIdx + 1u, 0u, 0u, 0u);
}
