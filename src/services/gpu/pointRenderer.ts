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
import { surveyFluxLimit } from '../../data/surveyFluxLimits';
import { fallbackOrientation } from '../../utils/random/fallbackOrientation';
import {
  absoluteFromApparent,
  cartesianToRaDecZ,
  expectedNumberDensity,
  vMaxWeight,
} from '../../utils/math';
import { surveySchechter, type SchechterTriple } from '../../data/surveyFluxLimits';

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
 *    axisRatio f32, positionAngleDeg f32,
 *    diameterKpc f32, vMaxWeight f32,
 *    schechterRatio f32]
 *
 * The first five slots are interpreted as f32 by the shader; slot 5 is
 * interpreted as u32; slots 6..10 are interpreted as f32 again.  JS-side
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
 *
 * Slot 10 (`vMaxWeight`) is the Malmquist 1/V_max alpha-modulation factor
 * baked at upload time (Task 3 of the malmquist-bias plan).  Each galaxy's
 * weight is `clamp((dRef / dMax(M, mLim))³, 0, 1)` — a per-galaxy quantity
 * that depends on its absolute magnitude and the survey's flux limit.
 *
 * ### Why bake at upload time rather than compute per-frame?
 *
 * Two reasons.  First, the inputs (apparent magnitude, distance,
 * surveyFluxLimit(source)) never change after upload — recomputing per
 * frame would burn ~3.5 M `pow(10, …) / Math.hypot()` evaluations every
 * draw.  Second, an alternative approach — passing the survey's `mLim`
 * via the uniform and computing the weight in WGSL — would reintroduce
 * the `queue.writeBuffer` race we already paid down for `globalInstanceIdx`
 * (see the long comment on slot 5): every per-source `writeBuffer` between
 * draws within one submit completes BEFORE any draw runs, so all draws
 * would read the last `mLim` written.  Baking sidesteps the race entirely
 * at a cost of 4 bytes per instance (~14 MB at 3.5 M points).
 */
const SLOTS_PER_POINT = 12;

/**
 * Byte stride between consecutive per-instance records in the vertex buffer.
 *
 * 12 slots × 4 bytes = 48 bytes. The pipeline's `arrayStride` must match
 * this exactly; if it disagrees WebGPU will either validate-error or
 * silently read garbage.  PickRenderer's pipeline declares the same
 * 48-byte stride and the same attribute table, so the two pipelines stay
 * compatible with this single vertex buffer layout.
 */
const POINT_STRIDE = SLOTS_PER_POINT * 4; // 48 bytes

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
 * Sits at slot index 8 (offset 32).  The fragment shader rotates the
 * squashed ellipse around the billboard centre by this angle.
 */
const POSITION_ANGLE_BYTE_OFFSET = 32;

/**
 * Byte offset of the `diameterKpc` slot — the per-galaxy physical disk
 * diameter in kiloparsecs.
 *
 * Sits at slot index 9 (offset 36) — the new 10th slot of the v4-aligned
 * vertex format.  The vertex shader uses it to compute each billboard's
 * apparent angular radius from `(diameterKpc / 1000 / 2) / distance_Mpc`,
 * replacing the prior project-wide `GALAXY_RADIUS_MPC = 0.06` constant
 * so dwarfs render small and giants render large.  4 extra bytes per
 * instance is ~14 MB at 3.5 M points — comfortably within VRAM budget.
 */
const DIAMETER_KPC_BYTE_OFFSET = 36;

/**
 * Byte offset of the `vMaxWeight` slot — the per-galaxy 1/V_max alpha
 * multiplier used by the Malmquist-bias correction's mode 2.
 *
 * Sits at slot index 10 (offset 40) — the new 11th slot.  Baked at
 * upload time from each galaxy's apparent magnitude, Cartesian distance
 * and the survey's flux limit.  The fragment shader multiplies the
 * intensity by this value when `biasMode == 2u` and otherwise ignores
 * it (via a `select`), so modes 0/1/3 see no change.
 *
 * Why a fresh slot rather than re-using one?  None of the existing
 * slots carry "absolute magnitude" or "max detectable distance", and
 * computing the weight on the GPU would either cost a `pow(10, ...)`
 * per vertex or a per-source uniform write that races with the draw
 * loop (see the SLOTS_PER_POINT comment for the full reasoning).
 */
const VMAX_WEIGHT_BYTE_OFFSET = 40;

/**
 * Byte offset of the `schechterRatio` slot — the per-galaxy Schechter
 * density-correction ratio used by the Malmquist-bias correction's mode 3.
 *
 * Sits at slot index 11 (offset 44) — the new 12th slot.  Baked at upload
 * time as `clamp(N_ref / n(d), 0, 10)` from each galaxy's Cartesian
 * distance, the survey's apparent flux limit, and the Schechter triple.
 * Read by the fragment shader's mode-3 alpha modulation, replacing the
 * per-fragment 200-step trapezoidal integral that the original Task 4
 * implementation ran inline (commit 7a6d810).
 *
 * ### Why per-vertex is correct
 *
 * Each galaxy's distance from origin is fixed at upload time (the catalog
 * parser baked the linear-cosmology Cartesian position into the .bin), so
 * the Schechter integral at that distance is also fixed.  Mirrors exactly
 * the pattern Task 3 used for `vMaxWeight`: per-galaxy invariance →
 * one-shot bake at upload.
 *
 * ### Why baking is *much* faster
 *
 * The pre-bake fragment-stage loop ran ~3.5 M galaxies × ~6 fragments/
 * billboard × 200 iterations ≈ 4 billion `pow + exp` evaluations per
 * frame.  Baking collapses that to a single `f32` multiply — the same
 * cost as mode 2's `vMaxWeight` lookup.  4 extra bytes per instance is
 * ~14 MB at 3.5 M points, comfortably within VRAM budget.
 *
 * ### Numeric stability
 *
 * The CPU bake mirrors the shader's old clamp `clamp(ratio, 0, 10)` and
 * also handles the degenerate-distance case (`nHere == 0` or NaN, which
 * happens at extreme distances where the integration window collapses)
 * by writing 0 — so far galaxies with no detectable density disappear in
 * mode 3 instead of going infinite/NaN.  Visual output is bit-for-bit
 * equivalent to the pre-bake implementation modulo the integration
 * step-count rounding (both CPU and GPU used 200 steps).
 */
const SCHECHTER_RATIO_BYTE_OFFSET = 44;

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.
 *
 * The struct contains (offsets are byte offsets from the start of the buffer):
 *
 *   bytes  0..63  : viewProj          mat4x4<f32>  (16 floats = 64 bytes)
 *   bytes 64..71  : viewport          vec2<f32>    (2 floats)        }
 *   bytes 72..75  : pointSizePx       f32          (1 float)         } 16 bytes (one vec4 slot)
 *   bytes 76..79  : brightness        f32          (1 float)         }
 *   bytes 80..83  : selectedIndex     u32                             ← picker writes here
 *   bytes 84..87  : instanceIdOffset  u32                             ← per-source offset (legacy; baked per-vertex now)
 *   bytes 88..95  : _pad0/_pad1       u32×2        (written as 0)     ← alignment for the next vec3 slot
 *   bytes 96..107 : camPosWorld       vec3<f32>    (3 floats)        } 16 bytes (one vec4 slot)
 *   bytes 108..111: pxPerRad          f32          (1 float)         }
 *   bytes 112..115: highlightFallback u32                            }
 *   bytes 116..119: realOnlyMode      u32                            } 16 bytes (one vec4 slot)
 *   bytes 120..127: _pad3/_pad4       u32×2        (written as 0)    }
 *   bytes 128..131: biasMode          u32          (Malmquist mode)  }
 *   bytes 132..135: absMagLimit       f32          (volume-limit M)  }
 *   bytes 136..139: apparentMagLimit  f32          (Task 3, reserved)} 32 bytes
 *   bytes 140..143: schechterMStar    f32          (Task 4 — per-source) }  (two vec4 slots)
 *   bytes 144..147: schechterAlpha    f32          (Task 4 — per-source) }
 *   bytes 148..151: schechterMLim     f32          (Task 4 — per-source) }
 *   bytes 152..155: schechterNRef     f32          (Task 4 — per-source) }
 *   bytes 156..159: _pad5             u32          (written as 0)        }
 *
 * Total: 160 bytes — a multiple of 16 ✓
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
 *
 * The Malmquist-bias plan adds 7 × 4 = 28 bytes of payload (one u32 mode
 * selector + six f32 thresholds for Tasks 2-4).  Rounded up to a 16-byte
 * boundary that's 32 bytes added → 160 bytes total.  Task 4 (Schechter
 * density correction) writes the four `schechter*` slots PER SOURCE in
 * `draw()` between per-source draw calls — each survey has its own M*,
 * α, m_lim, and pre-computed central-density normaliser.  See the
 * `LoadedSource.schechter*` fields and `draw()`'s per-source uniform
 * write for the full reasoning.
 *
 * BYTE-OFFSET CONSTANTS for the per-source partial uniform write below.
 */
const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 8 * 4; // 160 bytes

// Note: the `schechter*` uniform slots at byte offsets 140..155 are now
// dead-but-reserved.  Originally `draw()` wrote 16 bytes per source here
// (mStar, alpha, mLim, nRef) so the fragment shader's 200-step trapezoidal
// integral (commit 7a6d810) could read the survey's selection function.
// That integral has moved to upload-time bake (see the per-vertex
// `schechterRatio` attribute), so neither fragment entry point reads
// these slots anymore.  We keep them in the WGSL `Uniforms` struct for
// binary compatibility — removing them would shift every subsequent
// member's offset and risk silently corrupting reads — and stop writing
// from JS.  Future work that reuses these reserved bytes (e.g. a
// different per-source uniform for a new bias mode) can target byte
// offset 140 without growing the buffer.

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
  /**
   * Current authoritative offset, recomputed after every upload/unload by
   * `recomputeInstanceIdOffsets`.  This is the running sum of `count`
   * across earlier-enum-order loaded sources.
   */
  instanceIdOffset: number;
  /**
   * The `priorCount` that was actually baked into this source's vertex
   * buffer's `globalInstanceIdx` slot at upload time.  Compared against
   * `instanceIdOffset` to detect when the baked values are stale (because
   * an *earlier*-enum-order source was uploaded later — happens whenever
   * parallel fetches resolve out of enum order).  When stale, the upload
   * caller re-runs `upload(source, cloud)` so the bake catches up.
   */
  bakedPriorCount: number;
  /**
   * Reference to the original cloud passed to `upload()`.  Held so we can
   * re-bake the vertex buffer on demand (see `bakedPriorCount` above).
   * Same object the engine already holds in its `clouds` map — no
   * duplication, just a pointer.
   */
  cloud: PointCloud;
  /**
   * Schechter LF triple `(M*, α, φ*)` for this survey's selection band.
   * Looked up from `surveySchechter(source)` at upload time.  Mode 3 of
   * the Malmquist-bias correction reads M* and α (φ* cancels in the
   * `N_ref / n(d)` ratio) into the uniform buffer between per-source
   * draw calls.
   */
  schechter: SchechterTriple;
  /**
   * Survey apparent-magnitude flux limit (e.g. SDSS = 17.77).  Forwarded
   * to the shader so the per-fragment Schechter integration knows where
   * the detection horizon lands at the fragment's distance.
   */
  mLim: number;
  /**
   * Pre-computed central-density normaliser N_ref = n(d = 10 Mpc) for
   * this survey's Schechter parameters.  Computed once at upload time
   * via `expectedNumberDensity({...sch, mLim, dMpc: 10})` and reused
   * every frame — the integral is over absolute magnitude only, so the
   * result depends only on the survey's selection function (M*, α, φ*,
   * m_lim) and the chosen reference distance, not on any frame-time
   * state.
   *
   * Why d = 10 Mpc as the reference?  Far enough beyond the over-density
   * of the very local universe (the Local Group sits at d ≈ 0–4 Mpc) to
   * be a representative "central" density, but still well within the
   * high-completeness regime for every survey we render — at d = 10 Mpc
   * even the brightest Schechter cutoff M ≈ -25 corresponds to apparent
   * mag ≈ 5, far above any real flux limit.
   */
  nRef: number;
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
              // diameterKpc (f32) — offset 36 bytes.  Per-galaxy physical
              // diameter in kiloparsecs.  Vertex shader uses it to size the
              // billboard's apparent radius (replacing the prior project-wide
              // GALAXY_RADIUS_MPC = 0.06 constant).
              { shaderLocation: 7, offset: DIAMETER_KPC_BYTE_OFFSET, format: 'float32' },
              // vMaxWeight (f32) — offset 40 bytes.  Per-galaxy 1/V_max
              // alpha multiplier baked at upload time (Task 3 of the
              // malmquist-bias plan).  Read by the fragment shader's
              // intensity computation, gated on `u.biasMode == 2u` via a
              // `select(1.0, vMaxWeight, …)` so the other three modes are
              // unaffected.  See VMAX_WEIGHT_BYTE_OFFSET for the design
              // notes on why we bake instead of computing per-frame.
              { shaderLocation: 8, offset: VMAX_WEIGHT_BYTE_OFFSET, format: 'float32' },
              // schechterRatio (f32) — offset 44 bytes.  Per-galaxy
              // Schechter density-correction ratio baked at upload time
              // (replaces the per-fragment 200-step trapezoidal integral
              // from commit 7a6d810).  Read by the fragment shader's
              // intensity computation, gated on `u.biasMode == 3u` via a
              // `select(1.0, schechterRatio, …)` so the other three modes
              // are unaffected.  See SCHECHTER_RATIO_BYTE_OFFSET above for
              // the full design notes on the per-vertex bake.
              { shaderLocation: 9, offset: SCHECHTER_RATIO_BYTE_OFFSET, format: 'float32' },
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

    // ── Malmquist 1/V_max weight inputs ──────────────────────────────────────
    //
    // Pull the survey's apparent-magnitude flux limit once (m_lim) and pick
    // a reference distance for the per-galaxy weight normalisation.  Both
    // are constants over the whole upload, so we hoist them out of the
    // per-galaxy loop.
    //
    // D_REF_MPC = 750 was the plan's tuned default — roughly the midpoint
    // of typical SDSS camera framing.  An intrinsically-bright galaxy with
    // dMax ≫ dRef gets a small weight (rendered dimmer because it
    // represents only a sliver of the comoving volume), while a faint
    // galaxy with dMax < dRef gets clamped to 1 (it's already representative
    // of its slice — no extra dimming or boosting).
    //
    // We derive each galaxy's absolute magnitude from its observed apparent
    // magnitude + Cartesian distance from origin (the linear-cosmology
    // distance the catalog parser baked in).  The shader's existing
    // distance-modulus calc (used for the volume-limited mode) does the
    // same thing GPU-side, but for the weight we need the result CPU-side
    // anyway because we're baking — and `absoluteFromApparent` is the
    // canonical helper for the equation.
    const surveyMLim = surveyFluxLimit(source);
    const D_REF_MPC = 750;

    // ── Schechter LF parameters + central-density normaliser ────────────────
    //
    // Task 4 of the Malmquist-bias plan: pre-compute the central detectable
    // density `N_ref = n(d = 10 Mpc)` for this survey's Schechter triple.
    // The shader's mode-3 alpha modulator divides this by the per-fragment
    // density `n(d)` to compute the brightness ratio.
    //
    // The integration depends only on the survey's selection function
    // (M*, α, φ*, m_lim) and the chosen reference distance — none of which
    // change at runtime — so doing it once at upload is the obvious choice.
    // We stash the triple alongside `nRef` so `draw()` can write all four
    // values into the uniform buffer in a single 16-byte partial write.
    const schechter = surveySchechter(source);
    const nRef = expectedNumberDensity({
      ...schechter,
      mLim: surveyMLim,
      dMpc: 10,
    });

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
      // Slot 9 (offset 36): per-galaxy physical diameter in kpc. The build
      // pipeline guarantees a finite, positive value (real catalog
      // measurement when available, else DEFAULT_GALAXY_DIAMETER_KPC = 30),
      // so we copy through with the same `!` non-null assertion as the
      // sibling SoA fields above.
      interleaved[o + 9] = cloud.diameterKpc[i]!;

      // Slot 10 (offset 40): per-galaxy 1/V_max weight.  Computed from the
      // *raw* apparent magnitude (NOT `g + magOffset` — the per-survey
      // brightness-normalisation shift is a visualisation cosmetic, not a
      // physical change to the photometry) plus the Cartesian distance
      // from origin.  vMaxWeight() handles NaN inputs by returning 0 — so
      // galaxies with missing photometry contribute nothing to the
      // 1/V_max-modulated render, which is exactly the right behaviour
      // (we don't know their dMax, so we can't trust their weight).
      const dx = cloud.positions[i * 3 + 0]!;
      const dy = cloud.positions[i * 3 + 1]!;
      const dz = cloud.positions[i * 3 + 2]!;
      const dMpc = Math.hypot(dx, dy, dz);
      const absMag = absoluteFromApparent(g, dMpc);
      interleaved[o + 10] = vMaxWeight({
        absMag,
        mLim: surveyMLim,
        dRefMpc: D_REF_MPC,
      });

      // Slot 11 (offset 44): per-galaxy Schechter density-correction ratio.
      //
      // Originally implemented as a per-fragment 200-step trapezoidal integral
      // in `points.wgsl` (commit 7a6d810, Task 4).  At ~3.5 M galaxies × ~6
      // fragments/billboard × 200 iterations the per-frame cost was a few
      // billion `pow + exp` evaluations — the slowest path in the fragment
      // shader by an order of magnitude.
      //
      // This bake mirrors Task 3's `vMaxWeight` pattern: each galaxy's distance
      // from origin is fixed at upload time, the Schechter integral at that
      // distance depends only on the survey's selection function (M*, α, m_lim)
      // and that fixed distance, so the value is also fixed at upload time.
      // We compute it here once and the fragment shader reads a single f32.
      //
      // Numeric stability: `expectedNumberDensity` already returns finite
      // values, but at extreme distances the integration window collapses to
      // empty and it returns 0.  Mirror the shader's old guard `nHere > 0`
      // by baking 0 for that case (galaxy disappears in mode 3 — same
      // behaviour as before).  The clamp at 10 matches the shader's old
      // `clamp(ratio, 0, 10)` exactly so the visual output is preserved.
      const nHere = expectedNumberDensity({
        ...schechter,
        mLim: surveyMLim,
        dMpc,
      });
      // Schechter ratio: in theory we want nRef/nHere so the brighter the
      // local density the more the alpha boost — flattening the apparent
      // over-density toward something uniform.  In practice, additive
      // blending across millions of overlapping galaxy billboards turns
      // any multiplier > 1 into a bloom: even sqrt(ratio) clamped at 3
      // washed the canvas to peak white.
      //
      // For visualisation we therefore apply the correction as DIM-ONLY
      // — clamp the multiplier to [0, 1] so the mode can darken the
      // dense-and-overdrawn nearby cluster without ever boosting the
      // sparse far field.  The resulting visual still achieves the
      // intent ("Local Group looks like every other supercluster")
      // because the over-bright nearby concentration shrinks while
      // distant galaxies stay at their natural alpha.  The math is no
      // longer the literal Schechter inversion, but the visual cue is
      // honest: dense regions in the catalog look less dense in the
      // render.  See Task 4 Step 3 of the Malmquist-bias plan for the
      // softer-correction tuning note that motivated this.
      const ratioRaw =
        nHere > 0 && Number.isFinite(nHere) ? nRef / nHere : 0;
      const schechterRatio = Math.min(1, Math.sqrt(ratioRaw));
      interleaved[o + 11] = schechterRatio;
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
    this.clouds.set(source, {
      buffer,
      count: cloud.count,
      instanceIdOffset: priorCount,
      bakedPriorCount: priorCount,
      cloud,
      schechter,
      mLim: surveyMLim,
      nRef,
    });
    this.recomputeInstanceIdOffsets();
    this.rebakeStaleSources();
  }

  /**
   * Re-upload any source whose `bakedPriorCount` diverged from its current
   * `instanceIdOffset`.
   *
   * Why this is needed: parallel fetches resolve in unpredictable order, so
   * a later-enum-order source (e.g. 2MRS) can upload BEFORE an earlier one
   * (SDSS).  The first upload bakes the wrong `priorCount` into its
   * vertex buffer's `globalInstanceIdx` slot — when SDSS arrives later
   * and `recomputeInstanceIdOffsets` shifts 2MRS's authoritative offset,
   * the baked vertex data stays unchanged and the picker resolves
   * 2MRS-clicks to the wrong source slice.
   *
   * The fix: after every recompute, walk loaded sources and re-call
   * `upload()` for any whose baked offset is now stale.  The recursion
   * guard prevents infinite loops — after one rebake pass every source
   * is consistent (since `recomputeInstanceIdOffsets` is idempotent and
   * the rebake itself doesn't change any other source's offset).
   */
  private rebaking = false;
  private rebakeStaleSources(): void {
    if (this.rebaking) return;
    this.rebaking = true;
    try {
      for (const s of ALL_SOURCES) {
        const entry = this.clouds.get(s);
        if (!entry) continue;
        if (entry.bakedPriorCount !== entry.instanceIdOffset) {
          // Re-upload with the correct priorCount.  upload() destroys the
          // old buffer, allocates a new one, and updates the LoadedSource
          // entry — the caller's local snapshot of `entry` is dead after
          // this returns, but we don't keep a reference past the call.
          this.upload(s, entry.cloud);
        }
      }
    } finally {
      this.rebaking = false;
    }
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

  /**
   * Return the cross-survey global ID offset for `source`, or 0 when the
   * source isn't loaded.  Used by the engine's `selectFamous` to
   * convert a local catalog index to the global index format the
   * renderer's per-vertex `globalInstanceIdx` carries.
   */
  instanceIdOffset(source: Source): number {
    return this.clouds.get(source)?.instanceIdOffset ?? 0;
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
   * @param biasMode           Malmquist-bias correction selector.  Numeric
   *                           values come from `data/biasMode.ts` and must
   *                           match the WGSL literals (`1u` = volume-limit,
   *                           `2u` = 1/V_max, `3u` = Schechter).  When 0
   *                           (the default), the shader applies no
   *                           correction and the next four fields are
   *                           ignored.
   * @param absMagLimit        Threshold for `biasMode == 1` (volume-limit):
   *                           galaxies with absolute magnitude *fainter*
   *                           than this (numerically larger M) are
   *                           discarded in the vertex stage by emitting a
   *                           degenerate clip-space position.
   * @param apparentMagLimit   Reserved for Task 3 (1/V_max weighting).
   *                           Pass 0 until that task lands; the shader
   *                           ignores it while `biasMode != 2u`.
   * @param schechterMStar     Initial Schechter M* value written into the
   *                           global uniform slot.  Task 4 of the
   *                           Malmquist-bias plan overrides this with the
   *                           per-source value in the per-source draw
   *                           loop, so this initial value only matters
   *                           before any source has been written (i.e.
   *                           never observable in practice).  Engine
   *                           passes 0 — fine.
   * @param schechterAlpha     Initial Schechter α value.  Same per-source
   *                           override as `schechterMStar`.
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
    biasMode: number,
    absMagLimit: number,
    apparentMagLimit: number,
    schechterMStar: number,
    schechterAlpha: number,
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

    // Malmquist-bias correction state (Task 2 of the malmquist-bias plan).
    // Slots 32-39 cover bytes 128..159 — see UNIFORM_BYTES doc above for the
    // detailed offsets.  We write the integer mode through the u32 view and
    // the four f32 thresholds through the f32 view; both views point at the
    // same underlying ArrayBuffer so the writes don't collide.  `biasMode`
    // is masked with `>>> 0` to coerce the JS number to an unsigned 32-bit
    // value (defensive — `BiasMode` only has 0..3 but a future caller might
    // pass something via `setBiasMode`).
    u32[32] = biasMode >>> 0;       // bytes 128..131  biasMode
    f32[33] = absMagLimit;          // bytes 132..135  absMagLimit
    f32[34] = apparentMagLimit;     // bytes 136..139  apparentMagLimit (Task 3)
    f32[35] = schechterMStar;       // bytes 140..143  schechterMStar   (Task 4)
    f32[36] = schechterAlpha;       // bytes 144..147  schechterAlpha   (Task 4)
    // u32[37..39] (_pad5/_pad6/_pad7) stay zero — they round the struct
    // out to a 16-byte boundary so a future vec3/vec4 append doesn't
    // silently break alignment.

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

    // ── Per-source draw loop (post-Schechter-bake refactor) ─────────────────
    //
    // The previous revision wrote a per-source 16-byte Schechter quartet
    // (M*, α, m_lim, N_ref) into the uniform buffer between draws to feed
    // the fragment shader's mode-3 integral.  That integral has moved to
    // upload-time bake (see the per-galaxy `schechterRatio` slot in the
    // vertex buffer), so the per-source uniform write is gone.  The
    // uniform-struct slots at byte offsets 140..155 are now dead-but-
    // reserved — leaving the WGSL struct layout intact avoids re-aligning
    // every other field in the buffer.
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
