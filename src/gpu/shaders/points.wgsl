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
  // STD140 ALIGNMENT NOTE: The four preceding fields (vec2 + f32 + f32 = 16 bytes)
  // bring the running offset to 80 bytes.  A u32 has 4-byte alignment, so it
  // fits at offset 80 without padding.  The *struct itself* must be padded to
  // a multiple of 16 bytes (the struct's own alignment in WGSL, which equals
  // the largest member alignment — here 16 bytes from mat4x4).  So after this
  // u32 (offset 80, size 4) we add 3 padding u32s to bring the total to 96.
  // Without this tail padding, WebGPU would reject the uniform buffer binding
  // with a size-alignment validation error.
  selectedIndex: u32,

  // Three u32 padding words to round the struct size from 84 to 96 bytes,
  // satisfying the 16-byte alignment requirement for WGSL uniform structs.
  // We use three separate u32 fields (not vec3<u32>) because vec3<u32> has a
  // 16-byte alignment requirement of its own, which would force an 8-byte gap
  // between selectedIndex (at offset 80) and the vec3 (which would have to
  // start at offset 96), bloating the struct unnecessarily. Three scalar u32s
  // have 4-byte alignment and pack contiguously at offsets 84, 88, 92.
  // Their values are ignored by the shader; PointRenderer writes them as 0.
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
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

  // ── SELECTION CHECK ───────────────────────────────────────────────────────
  //
  // Determine whether this instance is the user-selected point.
  // `u.selectedIndex` is 0xFFFFFFFFu when nothing is selected (sentinel),
  // so this comparison is only ever true for a real selection.
  let isSelected = (ii == u.selectedIndex);

  // Scale the billboard ~8× for the selected point so the selection ring
  // is unmistakable — even a faint, magnitude-22 galaxy gets a visible halo.
  // Non-selected points keep the original pointSizePx radius.
  //
  // We use `select(normalSize, selectedSize, isSelected)` — WGSL's ternary.
  // Recall the argument order: select(falseValue, trueValue, condition).
  let sizeScale = select(1.0, 8.0, isSelected);

  // ── PIXEL-SIZE-IN-CLIP-SPACE CONVERSION ──────────────────────────────────
  //
  // We want the billboard to be `pointSizePx` pixels in radius on screen,
  // regardless of the point's depth.
  //
  // Clip space spans [-1, +1] in X and Y — a range of 2.0 in each direction.
  // To move 1 pixel right in clip space, we shift by 2/viewportWidth.
  // Similarly for Y.
  //
  // BUT clip space hasn't been perspective-divided yet. The GPU divides xyz by
  // w to get NDC. If we add a raw clip-space offset, it gets divided by w too,
  // making the apparent size shrink with distance (points farther away look
  // smaller) — the opposite of what we want.
  //
  // Fix: multiply the offset by center.w. This cancels the divide-by-w step:
  //   NDC offset = (corner * pointSizePx * pxToClip * center.w) / center.w
  //              = corner * pointSizePx * pxToClip
  //
  // Result: the billboard stays exactly `pointSizePx` pixels regardless of depth.
  let pxToClip = vec2<f32>(2.0 / u.viewport.x, 2.0 / u.viewport.y);
  let offset   = corner * u.pointSizePx * sizeScale * pxToClip * center.w;

  var out: VSOut;

  // Add the screen-space offset to the projected centre.
  // Only X and Y move; Z and W stay unchanged (depth and perspective are unaffected).
  out.clip = center + vec4<f32>(offset, 0.0, 0.0);

  // Pass the quad corner through as UV; used in the fragment shader to
  // compute distance from the billboard centre.
  out.uv = corner;

  // Look up the colour for this point's g−r index.
  out.tint = ramp(p.colorIndex);

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

  // Propagate the instance index for the pick fragment entry point (fsPick).
  // The visual `fs` entry point ignores this field entirely — WGSL silently
  // allows a fragment shader to declare fewer inputs than the vertex shader
  // outputs, as long as the @location values that *are* declared match.
  //
  // We keep this here so both fragment entry points share the same vertex stage.
  out.instanceIdx = ii;

  // Propagate the selection flag for the visual fragment entry point.
  // 1u = this instance is selected; 0u = normal point.
  out.selected = select(0u, 1u, isSelected);

  return out;
}

// ─── fragment stage ───────────────────────────────────────────────────────────

// The fragment shader runs once per pixel covered by a rasterised triangle.
// `in.uv` has been interpolated from the three vertices — but since our quad
// corners all share the same tint and intensity, only uv varies meaningfully.

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // `dot(v, v)` = v.x² + v.y² = r² (squared distance from billboard centre).
  // Because our UV space is [-1, +1], the unit disk is exactly r² ≤ 1.
  let r2 = dot(in.uv, in.uv);

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
    // Outside the outer edge of the scaled billboard — discard.
    if (r2 > 1.0) { discard; }

    // ── Inner disk (the point itself) ──────────────────────────────────────
    //
    // We scaled the billboard 8× in `vs`, so the original point's footprint
    // occupies the inner 1/8 in linear distance — i.e. r² ≤ (1/8)² = 1/64
    // ≈ 0.0156 in this scaled UV space. Inside that radius we render the
    // *normal* point disk so the user can still see the selected galaxy's
    // own brightness, not just the highlight ring around it.
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
    if (r2 > 0.72) {
      let bandCentre = 0.86;
      let bandDist   = abs(r2 - bandCentre);
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

  // ── NORMAL POINT — solid disk with Gaussian falloff ───────────────────────

  // Discard the four corners of the rectangular quad that fall outside the
  // unit disk. Without this, each point would render as a square, not a circle.
  // `discard` terminates the fragment shader and writes nothing to the render
  // target — equivalent to a transparency of 0 but without the blend cost.
  if (r2 > 1.0) { discard; }

  // Gaussian-like falloff: bright at centre (r²=0 → e⁰=1), fading to e⁻⁴≈0.018
  // at the edge (r²=1). The factor 4.0 controls how tightly the glow is
  // concentrated; larger values give a sharper, more star-like point.
  let alpha = exp(-r2 * 4.0);

  // Scale the colour by the per-point intensity.
  let rgb = in.tint * in.intensity;

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
  // The g/b/a channels are unused — we only read the r channel back on the
  // JS side.  Filling them with 0 keeps the output well-defined.
  return vec4<u32>(in.instanceIdx + 1u, 0u, 0u, 0u);
}
