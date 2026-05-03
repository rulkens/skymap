/**
 * PointRenderer — GPU pipeline owner for instanced billboard point sprites.
 *
 * ### How it pairs with points.wgsl
 *
 * The WGSL shader draws each catalog point as a tiny quad (two triangles,
 * six vertices) using WebGPU's *instanced draw* mechanism:
 *
 *   draw(vertexCount=6, instanceCount=N)
 *
 * The vertex shader receives:
 *   - `@builtin(vertex_index)` cycling 0..5 — which corner of the billboard
 *     quad this invocation draws.
 *   - Per-instance attributes (`@location(0..2)`) — the catalog point's world
 *     position, magnitude, and colour index — read once per *point*, not once
 *     per vertex.
 *
 * ### Multi-source rendering (Task 4)
 *
 * Earlier revisions of this class held a single vertex buffer, so the
 * renderer could only ever display one point cloud at a time. The
 * multi-survey integration plan (Task 4) replaces that with a
 * `Map<Source, GPUBuffer>`: each loaded survey gets its own buffer and its
 * own draw call. A 32-bit visibility bitmask, supplied by the engine each
 * frame, decides which sources are drawn — the renderer simply skips the
 * draw call for any source whose bit is clear.
 *
 * Per-source draw calls also let the picker keep a *global* per-point index
 * across surveys: each draw passes its `instanceIdOffset` (sum of prior
 * sources' counts) to the shader via the uniform buffer, and `fsPick` adds
 * that offset to the per-instance index it writes into the pick texture.
 *
 * ### Relationship to other modules
 *
 *   PointCloud  →  upload(source, …)    →  GPU vertex buffer per source
 *   OrbitCamera →  computeViewProj()    →  draw()  →  uniform buffer  (every frame)
 *
 * @module
 */

import { mat4 } from 'gl-matrix';
import type { PointCloud } from '../../@types';
import { pickColourIndex } from '../../data/colourIndex';
import { ALL_SOURCES, Source } from '../../data/sources';
import { fallbackOrientation } from '../../utils/random/fallbackOrientation';
import { cartesianToRaDecZ } from '../../utils/math';

// `?raw` is a Vite-specific import suffix. It tells the bundler to import the
// file's content as a plain string rather than attempting to execute it as
// JavaScript. The WGSL source text ends up inlined in the JS bundle; at
// runtime we hand it to `device.createShaderModule({ code: shaderSrc })`.
// Without `?raw`, Vite would try to parse the .wgsl file as JS and fail.
import shaderSrc from './shaders/points.wgsl?raw';

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * Number of 4-byte slots packed per catalog point in the vertex buffer.
 *
 * Layout (matches the `PerVertex` struct in points.wgsl):
 *   [x f32, y f32, z f32,
 *    magnitude f32, colorIndex f32,
 *    globalInstanceIdx u32, kPerZ f32,
 *    axisRatio f32, positionAngleDeg f32]
 *
 * The first five slots are interpreted as f32 by the shader; slot 5 is
 * interpreted as u32; slots 6, 7 and 8 are interpreted as f32 again.  JS-side
 * we treat the buffer as a flat ArrayBuffer and use Float32Array /
 * Uint32Array views over the same bytes so we can write each slot in its
 * native type without conversion.
 *
 * Slot 6 (`kPerZ`) carries a per-row K-correction coefficient.  Different
 * surveys use different colour pairs (SDSS u−g, GLADE B−J, 2MRS J−K) and
 * each pair has its own redshift dependence, so the K coefficient varies
 * per *row* — not per draw call.  Baking it into the vertex buffer lets the
 * shader read it for free.
 *
 * Slots 7 and 8 (`axisRatio`, `positionAngleDeg`) carry the galaxy's disk
 * orientation: minor/major axis ratio b/a in (0, 1] and the position angle
 * (east-of-north) in degrees, [0, 180).  Task 11 will use them to squash
 * and rotate the billboard's UV-space mask so face-on disks render as
 * circles and edge-on disks as thin streaks.  Until that lands the values
 * are forwarded through the vertex stage but the fragment stage still uses
 * the round `dot(uv, uv)` cutoff, so the visual is unchanged.
 */
const SLOTS_PER_POINT = 9;

/**
 * Byte stride between consecutive per-instance records in the vertex buffer.
 *
 * 9 slots × 4 bytes = 36 bytes. The pipeline's `arrayStride` must match
 * this exactly; if it disagrees WebGPU will either validate-error or
 * silently read garbage.  PickRenderer's pipeline declares the same
 * 36-byte stride and the same attribute table, so the two pipelines stay
 * compatible with this single vertex buffer layout.
 */
const POINT_STRIDE = SLOTS_PER_POINT * 4; // 36 bytes

/**
 * Byte offset of the `globalInstanceIdx` slot inside one per-instance record.
 *
 * Used by the upload loop to write the u32 global index into the buffer
 * after the five f32 slots.  Kept as a named constant so the offset stays
 * single-source-of-truth across upload + the pipeline descriptor below.
 */
const GLOBAL_IDX_BYTE_OFFSET = 20;

/**
 * Byte offset of the `kPerZ` slot inside one per-instance record.
 *
 * Sits immediately after the u32 globalInstanceIdx, at slot index 6.
 * Mirrors the `GLOBAL_IDX_BYTE_OFFSET` style so both the upload loop and
 * the pipeline-descriptor attribute table can refer to a single named
 * value.  The shader reads this as a per-instance f32 to scale the
 * K-correction by redshift on a per-row basis.
 */
const K_PER_Z_BYTE_OFFSET = 24;

/**
 * Byte offset of the `axisRatio` slot — the b/a ratio of the galaxy disk.
 *
 * Sits at slot index 7 (offset 28).  The fragment shader will use it to
 * squash the unit-circle UV mask into an ellipse before the radial cutoff;
 * the pipeline-descriptor below names this offset so the vertex-attribute
 * table stays in sync with the upload loop.
 */
const AXIS_RATIO_BYTE_OFFSET = 28;

/**
 * Byte offset of the `positionAngleDeg` slot — the east-of-north position
 * angle of the galaxy disk's major axis, in degrees [0, 180).
 *
 * Sits at slot index 8 (offset 32).  Last slot before the 36-byte stride
 * boundary.  The fragment shader will rotate the squashed ellipse around
 * the billboard centre by this angle.
 */
const POSITION_ANGLE_BYTE_OFFSET = 32;

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.
 *
 * The struct contains (offsets are byte offsets from the start of the buffer):
 *
 *   bytes  0..63  : viewProj         mat4x4<f32>  (16 floats = 64 bytes)
 *   bytes 64..71  : viewport         vec2<f32>    (2 floats)         }
 *   bytes 72..75  : pointSizePx      f32          (1 float)          } 16 bytes (one vec4 slot)
 *   bytes 76..79  : brightness       f32          (1 float)          }
 *   bytes 80..83  : selectedIndex    u32                             ← picker writes here
 *   bytes 84..87  : instanceIdOffset u32                             ← per-source offset (legacy; baked per-vertex now)
 *   bytes 88..95  : _pad0/_pad1      u32×2        (written as 0)     ← alignment for the next vec3 slot
 *   bytes 96..107 : camPosWorld      vec3<f32>    (3 floats)         } 16 bytes (one vec4 slot)
 *   bytes 108..111: pxPerRad         f32          (1 float)          }
 *   bytes 112..115: highlightFallback u32                            }
 *   bytes 116..119: realOnlyMode      u32                            } 16 bytes (one vec4 slot)
 *   bytes 120..127: _pad3/_pad4       u32×2        (written as 0)    }
 *
 * Total: 128 bytes — a multiple of 16 ✓
 *
 * WGSL uniform buffers follow rules similar to std140 (see WGSL spec §13,
 * "Memory Layout"). Each member must be aligned to its alignment value:
 * `vec3<f32>` requires 16-byte alignment, which is why the `_pad0/_pad1`
 * pair sits between `instanceIdOffset` and `camPosWorld` — without those
 * eight bytes, `camPosWorld` would land at offset 88, breaking alignment
 * and silently corrupting the camera position.
 *
 * The picker (`pickRenderer.ts`) writes only `selectedIndex` at offset 80;
 * the new tail fields are read-only from its perspective and are populated
 * by every visual `draw()` call before the pick pass runs.
 *
 * Task 15 added the trailing 16-byte slot for the orientation-visibility
 * toggles (`highlightFallback`, `realOnlyMode`).  The two trailing u32
 * padding words round the struct out to a 16-byte boundary so a future
 * vec3/vec4 append doesn't fall into mis-alignment.
 */
const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 4 * 4; // 128 bytes

// ─── Per-source bookkeeping ───────────────────────────────────────────────────

/**
 * Internal record describing one source's GPU vertex buffer.
 *
 * `instanceIdOffset` is the global index of this source's first point — the
 * sum of `count` across all *prior* sources in `Source` enum order. The
 * picker uses it (via the uniform) to translate each instance's local index
 * into a globally-unique ID, so JS can index into a merged point array.
 *
 * We recompute every offset after each upload/unload because the *order* of
 * sources is fixed (enum order) but which surveys are loaded varies. Doing
 * this on every change is O(numSources) — at most 32 entries — so it is not
 * a hot path.
 */
type LoadedSource = {
  buffer: GPUBuffer;
  count: number;
  instanceIdOffset: number;
};

// ─── PointRenderer ────────────────────────────────────────────────────────────

export class PointRenderer {
  /** The compiled and linked render pipeline (vertex + fragment stages). */
  private pipeline: GPURenderPipeline;

  /**
   * GPU-side uniform buffer holding the per-frame constants.
   *
   * Allocated once in the constructor with `UNIFORM | COPY_DST`:
   *   - `UNIFORM` means the shader can read it via `var<uniform>`.
   *   - `COPY_DST` means we can write into it with `device.queue.writeBuffer`.
   */
  private uniformBuffer_internal: GPUBuffer;

  /**
   * The bind group that wires the uniform buffer into `@group(0) @binding(0)`.
   *
   * Bind groups are immutable after creation — the buffer reference is baked
   * in. We create one here and reuse it every frame.
   */
  private bindGroup: GPUBindGroup;

  /**
   * One GPU vertex buffer per loaded survey.
   *
   * The map is keyed by `Source` (a numeric enum) and contains exactly the
   * surveys currently present on the GPU. `upload` adds or replaces an entry,
   * `unload` removes one, and after either operation we call
   * `recomputeInstanceIdOffsets` to re-derive the per-source offset values
   * in the canonical enum order.
   *
   * Why a `Map` (not a plain object)? `Map` preserves insertion order, has a
   * straightforward `delete`/`has` API, and avoids the prototype-chain
   * ambiguity of indexing a numeric-keyed object literal.
   */
  private readonly clouds = new Map<Source, LoadedSource>();

  // ─── Public accessors ────────────────────────────────────────────────────────

  /**
   * The GPU buffer holding per-frame uniform data (viewProj, viewport, etc.).
   *
   * Written every frame by `draw()`. The pick renderer reads the same buffer
   * so it sees the same camera state as the visual pass — no extra uploads needed.
   */
  get uniformBuffer(): GPUBuffer {
    return this.uniformBuffer_internal;
  }

  // ─── Constructor ────────────────────────────────────────────────────────────

  /**
   * Build the render pipeline, allocate the uniform buffer, and create the
   * bind group.
   *
   * @param device  The WebGPU logical device. Owned by the caller.
   * @param format  The swap-chain texture format (e.g. `'bgra8unorm'`).
   */
  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
  ) {
    const module = device.createShaderModule({ code: shaderSrc });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',

      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: POINT_STRIDE,
            stepMode: 'instance',
            attributes: [
              // position (vec3<f32>) — offset 0 bytes
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              // magnitude (f32) — offset 12 bytes
              { shaderLocation: 1, offset: 12, format: 'float32' },
              // colorIndex (f32) — offset 16 bytes
              { shaderLocation: 2, offset: 16, format: 'float32' },
              // globalInstanceIdx (u32) — offset 20 bytes
              {
                shaderLocation: 3,
                offset: GLOBAL_IDX_BYTE_OFFSET,
                format: 'uint32',
              },
              // kPerZ (f32) — offset 24 bytes.  Per-row K-correction
              // coefficient (see colourIndex.ts).  Different bands react
              // differently to redshift: SDSS u−g uses ~3.0/z (UV is highly
              // K-sensitive), GLADE B−J uses ~1.0/z, and 2MRS J−K uses 0.0/z
              // because near-infrared galaxy SEDs are nearly z-invariant in
              // the redshift range we care about.  The shader multiplies
              // this coefficient by `z` to obtain the per-point K shift.
              { shaderLocation: 4, offset: K_PER_Z_BYTE_OFFSET, format: 'float32' }, // kPerZ
              // axisRatio (f32) — offset 28 bytes.  Galaxy disk b/a in
              // (0, 1].  Read by the fragment shader (Task 11) to squash
              // the unit-circle UV mask into an ellipse before the radial
              // cutoff — face-on (b/a = 1) renders round, edge-on (b/a ≈
              // 0.2) renders as a thin streak.
              { shaderLocation: 5, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
              // positionAngleDeg (f32) — offset 32 bytes.  East-of-north
              // position angle of the major axis in degrees, [0, 180).
              // Read by the fragment shader (Task 11) to rotate the
              // squashed ellipse around the billboard centre.
              { shaderLocation: 6, offset: POSITION_ANGLE_BYTE_OFFSET, format: 'float32' },
            ],
          },
        ],
      },

      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Additive blend: dst.rgb = src.rgb + dst.rgb. Required for the
            // long-exposure-style brightening of overlapping galaxy halos
            // (see device.ts and the @module comment in points.wgsl).
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },

      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer_internal = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer_internal } }],
    });
  }

  // ─── Data upload ────────────────────────────────────────────────────────────

  /**
   * Pack a `PointCloud` into an interleaved GPU vertex buffer for the given
   * source. Replaces any previous buffer for that source.
   *
   * After the upload we recompute every loaded source's `instanceIdOffset` so
   * the picker's global ID space stays contiguous in `Source` enum order.
   *
   * ### Why we destroy the old buffer for this source first
   *
   * GPU buffers are fixed-size — there is no `realloc`. If the user loads a
   * different file for an already-present source, the new cloud may have a
   * different point count, so we throw away the old buffer and allocate a
   * new one. `GPUBuffer.destroy()` releases the VRAM immediately.
   *
   * @param source  Which survey the cloud belongs to.
   * @param cloud   Point cloud to upload (struct-of-arrays SDSS v2 shape).
   */
  upload(source: Source, cloud: PointCloud): void {
    // Allocate a CPU-side ArrayBuffer for the interleaved data and create
    // both Float32 and Uint32 views over it.  The five photometry/position
    // slots are written through `f32` and the sixth (globalInstanceIdx) is
    // written through `u32` — same underlying bytes, two different
    // interpretations, no conversion at upload time.
    const arrayBuffer = new ArrayBuffer(cloud.count * POINT_STRIDE);
    const interleaved = new Float32Array(arrayBuffer);
    const interleavedU32 = new Uint32Array(arrayBuffer);

    // ── Pre-bake global instance index ──────────────────────────────────────
    //
    // Each survey's points need a unique slice of the global ID range so
    // the picker (and the visual selection check) can identify them
    // unambiguously.  We compute this source's starting offset by summing
    // the counts of all *earlier* sources (in canonical `ALL_SOURCES`
    // order) that are already loaded.
    //
    // Why bake into the vertex buffer instead of writing per-draw uniforms?
    // The uniform-buffer approach hits the WebGPU writeBuffer/submit
    // ordering rule — every per-source writeBuffer between draws within
    // one submit completes BEFORE any draw runs, so all draws would read
    // the last offset written.  Baking sidesteps the race entirely.  The
    // cost is 4 bytes per instance (~10 MB for SDSS) — acceptable for a
    // visualisation.
    //
    // Edge case: if an *earlier* source (in enum order) is uploaded after
    // this one, this source's offset would shift forward but the values
    // already baked here would not.  In practice ALL_SOURCES order is
    // [Synthetic, SDSS, TwoMRS, Glade] and Synthetic is only loaded as a
    // fallback when every real survey fails (so it can't load alongside
    // them).  Real surveys all have offsets that depend only on each
    // other in stable enum order, so the issue does not arise in current
    // usage.  If we ever need to support out-of-enum-order uploads, the
    // fix is to re-upload affected later sources.
    let priorCount = 0;
    for (const s of ALL_SOURCES) {
      if (s === source) break;
      const entry = this.clouds.get(s);
      if (entry) priorCount += entry.count;
    }

    // ── Per-survey magnitude normalisation ───────────────────────────────────
    //
    // The shader's intensity formula `clamp((22 - mag) / 8, 0.05, 1.0)` is
    // tuned for SDSS-g where the typical apparent magnitude range is 14–22.
    // But our PointCloud stores `magG` from whichever band the source parser
    // put there:
    //
    //   - SDSS  → real g-band  (range ~14–22)
    //   - 2MRS  → J-band       (range ~4–15)   — much brighter numbers
    //   - GLADE → B-band       (range ~7–20)
    //
    // Without normalisation, 2MRS J=5 maps to (22-5)/8 = 2.1 → clamps to 1.0,
    // and most 2MRS galaxies render at maximum intensity with zero contrast
    // — which is why filaments are invisible in non-SDSS surveys: every
    // point looks equally bright, so density variation produces no visual
    // brightness variation, so the cosmic-web structure flattens out.
    //
    // Fix: shift each survey's magG distribution so its mean lands on the
    // SDSS-g median (≈ 18).  Each cloud retains its internal contrast (we
    // only translate, not stretch); after the shift the shader's existing
    // 14–22 ramp gives sensible bright→dim mapping for every survey.
    //
    // We use the mean (not median) because it's O(N) without sorting, and
    // for galaxy magnitude distributions the mean and median agree to
    // within a fraction of a magnitude — fine for this kind of cosmetic
    // remap.  NaN values are skipped in the mean calculation and replaced
    // with the post-shift target on the second pass.
    const SDSS_TARGET_MEAN_MAG = 18;
    let magSum = 0;
    let magCount = 0;
    for (let i = 0; i < cloud.count; i++) {
      const m = cloud.magG[i]!;
      if (Number.isFinite(m)) {
        magSum += m;
        magCount++;
      }
    }
    const sourceMean = magCount > 0 ? magSum / magCount : SDSS_TARGET_MEAN_MAG;
    const magOffset = SDSS_TARGET_MEAN_MAG - sourceMean;

    // Pre-compute the "is this galaxy's orientation a fallback?" flag for
    // every row. Done once at upload time (not per-frame); cost is the same
    // hash + Float32 round-trip we'd pay anyway in the InfoCard.
    //
    // Detection: replay `fallbackOrientation(objID, ra, dec)` and compare
    // against the stored cloud values. The build pipeline stamped the
    // SAME f32 we recompute here whenever a galaxy lacks real orientation,
    // so equality is exact (no epsilon needed). Match → fallback.
    //
    // We recover RA/Dec from the Cartesian position via cartesianToRaDecZ —
    // the same conversion the build pipeline used in reverse to place the
    // galaxy in world space.
    const isFallbackArr = new Uint8Array(cloud.count);
    for (let i = 0; i < cloud.count; i++) {
      const x = cloud.positions[i * 3 + 0]!;
      const y = cloud.positions[i * 3 + 1]!;
      const z = cloud.positions[i * 3 + 2]!;
      const [ra, dec] = cartesianToRaDecZ(x, y, z);
      const fb = fallbackOrientation(cloud.objIDs[i]!, ra, dec);
      const fbAr = new Float32Array([fb.axisRatio])[0]!;
      const fbPa = new Float32Array([fb.positionAngleDeg])[0]!;
      if (cloud.axisRatio[i] === fbAr && cloud.positionAngleDeg[i] === fbPa) {
        isFallbackArr[i] = 1;
      }
    }

    for (let i = 0; i < cloud.count; i++) {
      const o = i * SLOTS_PER_POINT;

      // Copy the three position components from the SoA positions array.
      interleaved[o + 0] = cloud.positions[i * 3 + 0]!;
      interleaved[o + 1] = cloud.positions[i * 3 + 1]!;
      interleaved[o + 2] = cloud.positions[i * 3 + 2]!;

      // Derive shader-side magnitude (g-band, normalised), colour index
      // (per-source colour pair, normalised to 0..2), and the per-row
      // K-correction coefficient from the v2 five-band photometry.  This is
      // one-shot work done at load time, not per frame.
      //
      // Why delegate band selection to `pickColourIndex`?  Each survey has
      // its own preferred informative band pair:
      //
      //   - SDSS  → u − g  (UV-blue contrast, sensitive to recent star formation)
      //   - GLADE → B − J  (visible-NIR baseline; B-J ≈ stellar-population age)
      //   - 2MRS  → J − K  (near-IR colour; almost flat in redshift)
      //
      // Picking the right pair per row keeps the colour-ramp meaningful
      // across surveys; doing it inside the renderer would couple the GPU
      // code to band-availability rules.  We therefore keep that logic in
      // `data/colourIndex.ts` and just consume its output here.
      //
      // `pickColourIndex` is NaN-tolerant: pass every band as-is (NaN or
      // real) and let the helper choose what to use.  When the row lacks
      // any usable colour pair it returns null — we map that case to the
      // existing `NO_COLOUR_SENTINEL = 999`, the magic value the shader
      // recognises as "no measurement".  The shader's existing missing-band
      // branch (no K-correction, fixed mid-ramp tint) keeps working
      // unchanged.
      //
      // The K coefficient is now per-row rather than a single shader
      // constant: SDSS u−g uses 3.0/z (UV K-shift is steep), GLADE B−J uses
      // 1.0/z (visible-NIR baseline is gentler), and 2MRS J−K uses 0.0/z
      // (the near-IR band pair is nearly z-invariant for the galaxy SEDs
      // and redshift range we care about).  When the colour is unknown we
      // write 0 — the sentinel branch already skips K-correction in the
      // shader, so 0 is the conservative default.
      const NO_COLOUR_SENTINEL = 999;
      const g = cloud.magG[i]!;

      const colour = pickColourIndex(
        source,
        cloud.magU[i]!,
        cloud.magG[i]!,
        cloud.magR[i]!,
        cloud.magI[i]!,
        cloud.magZ[i]!,
      );

      // Apply the per-survey mag offset.  NaN-G galaxies (rare; mostly GLADE
      // rows missing a B-band measurement) snap to the post-shift target so
      // they render at average intensity instead of vanishing.
      interleaved[o + 3] = Number.isFinite(g) ? g + magOffset : SDSS_TARGET_MEAN_MAG;
      interleaved[o + 4] = colour ? colour.colourIndex : NO_COLOUR_SENTINEL;
      // Slot 5 (offset 20 bytes) carries the GLOBAL instance index as a u32,
      // baked once at upload time so the shader doesn't need a per-draw
      // uniform write.  Read by the selection-halo check and `fsPick`.
      //
      // High bit of globalInstanceIdx flags fallback orientations (Task 15).
      // The vertex shader masks bit 31 off before exposing the canonical
      // 0..N-1 index for selection / pick lookups.  31 usable bits = 2 B
      // points, comfortably beyond any catalog we'll load.
      const idx = priorCount + i;
      const flag = isFallbackArr[i] === 1 ? 0x80000000 : 0;
      interleavedU32[o + 5] = (idx | flag) >>> 0;
      // Slot 6 (offset 24 bytes) carries the per-row K-correction
      // coefficient.  Multiplied by redshift in the shader to obtain the
      // K-shift this row should receive.  See `pickColourIndex` for the
      // per-source values.
      interleaved[o + 6] = colour ? colour.kPerZ : 0;
      // Slots 7 and 8 (offsets 28 and 32 bytes): galaxy orientation. The
      // shader reads these as f32; NaN at decode time would propagate into
      // the ellipse mask and produce a black billboard, but the build
      // pipeline guarantees both fields are finite (real or fallback) so
      // we just copy them through.
      interleaved[o + 7] = cloud.axisRatio[i]!;
      interleaved[o + 8] = cloud.positionAngleDeg[i]!;
    }

    // Destroy any previous buffer for this source before replacing it.
    this.clouds.get(source)?.buffer.destroy();

    const buffer = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, interleaved);

    // `instanceIdOffset` is set to the priorCount we already computed above
    // — same value baked into the vertex buffer's globalInstanceIdx slot.
    // We still call `recomputeInstanceIdOffsets()` afterwards so any later
    // source's offset stays consistent (it currently only matters as JS-
    // side bookkeeping for `loadedSources()` consumers; the shader reads
    // the baked vertex attribute directly and no longer needs a uniform
    // offset at all).
    this.clouds.set(source, { buffer, count: cloud.count, instanceIdOffset: priorCount });
    this.recomputeInstanceIdOffsets();
  }

  /**
   * Remove a source's GPU vertex buffer and reclaim its VRAM.
   *
   * No-op if the source was never uploaded — callers shouldn't have to track
   * which surveys are currently loaded.
   */
  unload(source: Source): void {
    const entry = this.clouds.get(source);
    if (!entry) return;
    entry.buffer.destroy();
    this.clouds.delete(source);
    this.recomputeInstanceIdOffsets();
  }

  /**
   * Walk every loaded source in `Source`-enum order and recompute its
   * `instanceIdOffset` as the running sum of prior counts.
   *
   * The order of iteration matters: the picker decodes a global instance ID
   * by checking which source's `[offset, offset+count)` slice it falls into,
   * which only works if the slices are contiguous and ordered identically on
   * the JS side. Using `ALL_SOURCES` (the canonical iteration order from
   * `data/sources.ts`) guarantees that.
   */
  private recomputeInstanceIdOffsets(): void {
    let runningOffset = 0;
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      entry.instanceIdOffset = runningOffset;
      runningOffset += entry.count;
    }
  }

  // ─── Public API for the engine + picker ─────────────────────────────────────

  /**
   * Total number of points across every loaded source. Used by the engine to
   * report cloud size in the status bar.
   */
  totalCount(): number {
    let total = 0;
    for (const entry of this.clouds.values()) total += entry.count;
    return total;
  }

  /**
   * Iterate over every loaded source's GPU buffer + bookkeeping in `Source`
   * enum order. Used by the picker to issue its own per-source draw calls
   * with matching `instanceIdOffset` values.
   *
   * The iterable is generated fresh on each call so the caller may call
   * `unload()` between iterations without affecting the snapshot — but they
   * must not assume the iteration order beyond "stable for this call".
   */
  *loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    instanceIdOffset: number;
  }> {
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      yield {
        source,
        vertexBuffer: entry.buffer,
        count: entry.count,
        instanceIdOffset: entry.instanceIdOffset,
      };
    }
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Write the per-frame uniforms (viewProj, viewport, …) once, then issue one
   * instanced draw call per visible source.
   *
   * @param pass               Active render pass encoder.
   * @param viewProj           Column-major 4×4 view-projection matrix.
   * @param viewportPx         Physical canvas size [w, h] in pixels.
   * @param pointSizePx        Far-field billboard floor radius in pixels.
   *                           Galaxies whose apparent angular radius is
   *                           smaller than this stay rendered at this size
   *                           so they remain visible as faint dots; nearby
   *                           galaxies grow past it to their real disc size.
   * @param brightness         Global brightness multiplier in [0, 1].
   * @param selectedIndex      Selected point's *global* index, or `0xFFFFFFFF` for none.
   * @param visibleSourceMask  Bitmask of `Source` values to draw (see `data/sources.ts`).
   * @param camPosWorld        Camera position in world Mpc (from
   *                           `orbitCamera.position`). Used by the vertex
   *                           shader to compute per-galaxy distance for
   *                           apparent-size sizing.
   * @param pxPerRad           Pixels-per-radian for the current viewport +
   *                           camera FOV, computed CPU-side as
   *                           `viewportPx[1] / (2 * tan(fovYRad / 2))`.
   *                           Engine pre-computes this once per frame and
   *                           hands it down so we don't repeat the `tan`
   *                           call inside the per-vertex shader.
   * @param highlightFallback  When true, fragments belonging to fallback-
   *                           orientation rows are tinted magenta in the
   *                           visual fragment shader.  Selection /
   *                           pick paths are unaffected.
   * @param realOnlyMode       When true, fragments belonging to fallback
   *                           rows are `discard`ed entirely.  Lets the
   *                           user see ONLY galaxies for which we have
   *                           measured (b/a, PA) photometric orientation.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    pointSizePx: number,
    brightness: number,
    selectedIndex: number,
    visibleSourceMask: number,
    camPosWorld: Readonly<[number, number, number]>,
    pxPerRad: number,
    highlightFallback: boolean,
    realOnlyMode: boolean,
  ): void {
    // Nothing to draw if no source has been uploaded yet.
    if (this.clouds.size === 0) return;

    // ── Pack and upload the uniform buffer ──────────────────────────────────
    //
    // The uniform layout still reserves the `instanceIdOffset` u32 slot at
    // byte offset 84 for backward compatibility with the shader struct, but
    // the visual + pick paths no longer read it — the global instance ID
    // is now baked per-vertex (see `globalInstanceIdx` in points.wgsl).  We
    // leave the slot zeroed here.
    //
    // The new tail fields (`camPosWorld` and `pxPerRad`) feed apparent-size
    // billboard sizing in the vertex shader. See the `UNIFORM_BYTES` doc
    // above for the exact byte layout — note the eight-byte gap between
    // `instanceIdOffset` and `camPosWorld` required by vec3 alignment.
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    f32.set(viewProj, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[18] = pointSizePx;
    f32[19] = brightness;
    u32[20] = selectedIndex >>> 0; // selectedIndex at byte offset 80
    // u32[21] (instanceIdOffset) and u32[22..23] (padding) are zero — the
    // shader no longer reads u32[21]; it's preserved only so the WGSL
    // struct layout stays binary-compatible across this refactor.
    f32[24] = camPosWorld[0]; // bytes 96..99
    f32[25] = camPosWorld[1]; // bytes 100..103
    f32[26] = camPosWorld[2]; // bytes 104..107
    f32[27] = pxPerRad;       // bytes 108..111
    // Task 15 — orientation-visibility toggles.  Two u32 booleans + 2 u32
    // padding rounding the struct to 128 bytes.  See UNIFORM_BYTES doc above.
    u32[28] = highlightFallback ? 1 : 0; // bytes 112..115
    u32[29] = realOnlyMode      ? 1 : 0; // bytes 116..119
    // u32[30] / u32[31] (_pad3 / _pad4) stay zero.

    this.device.queue.writeBuffer(this.uniformBuffer_internal, 0, buf);

    // ── Per-source draw loop ────────────────────────────────────────────────
    //
    // Bind the pipeline + bind group once (these don't change between draws)
    // and then for each loaded source:
    //   1. Skip it if its visibility bit is not set in the mask.
    //   2. Set this source's vertex buffer and issue a 6-vertex × N-instance
    //      draw call.
    //
    // No more per-source uniform writes — the per-instance vertex attribute
    // `globalInstanceIdx` already encodes which slice of the global ID
    // range each source occupies, so the shader doesn't need a per-draw
    // offset uniform.
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);

    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;

      // Bitmask check: `(mask >> source) & 1`. Equivalent to maskHas() from
      // `data/sources.ts`, inlined here because this is the per-frame hot path.
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(6, entry.count);
    }
  }
}
