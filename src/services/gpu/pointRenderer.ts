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
import { ALL_SOURCES, Source } from '../../data/sources';
import { type SchechterTriple } from '../../data/surveyFluxLimits';
import {
  computePriorCount,
  type BuildPointInterleavedBufferInput,
  type BuildPointInterleavedBufferMode,
  type BuildPointInterleavedBufferResult,
} from '../engine/buildPointInterleavedBuffer';

// `?worker` is a Vite-specific import suffix.  It instructs the bundler to
// emit `buildPointInterleavedBuffer.worker.ts` as a separate worker chunk
// and hand us back a default-exported class whose `new`-instantiation
// spawns a Worker running that bundle.  The worker bundle pulls in the
// pure-function module on its own — see that file's doc for why the bake
// runs off-thread (10-second main-thread freeze when survey .bin files
// arrive).
//
// In Node-only test environments the `?worker` suffix isn't resolvable;
// tests inject a synchronous fallback via `setBuildBufferFactory` instead
// of importing this module.  See the `BuildBufferFactory` type below.
import BuildPointBufferWorker from '../engine/buildPointInterleavedBuffer.worker?worker';

// Lazy-Schechter worker import — same `?worker` Vite suffix as the main
// vertex bake, but for the much smaller (single Float32Array) Schechter
// integral.  Spawned by `applySchechterMode()` the first time the user
// selects `BiasMode.Schechter`; subsequent toggles reuse the cached
// `Float32Array` per source for instant re-toggle.
import ComputeSchechterRatiosWorker from '../engine/computeSchechterRatios.worker?worker';
import { type ComputeSchechterRatiosInput } from '../engine/computeSchechterRatios';

// Lazy-angular-reweight worker import — same `?worker` Vite suffix.  The
// HEALPix bake is much cheaper than the Schechter integral (~100-300 ms for
// a full deck vs 1-2 s) but still long enough to drop a frame, so we
// off-thread it for parity with the other lazy bakes.  Spawned by
// `applyAngularReweightMode()` the first time the user picks
// `BiasMode.AngularReweight`; subsequent toggles reuse `cachedAngularWeights`
// for instant re-toggle.
import ComputeAngularWeightsWorker from '../engine/computeAngularWeights.worker?worker';
import { type ComputeAngularWeightsInput } from '../engine/computeAngularWeights';

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
 *    schechterRatio f32, angularDensityWeight f32]
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
const SLOTS_PER_POINT = 13;

/**
 * Byte stride between consecutive per-instance records in the vertex buffer.
 *
 * 13 slots × 4 bytes = 52 bytes. The pipeline's `arrayStride` must match
 * this exactly; if it disagrees WebGPU will either validate-error or
 * silently read garbage.  PickRenderer's pipeline declares the same
 * 52-byte stride and the same attribute table, so the two pipelines stay
 * compatible with this single vertex buffer layout.
 */
const POINT_STRIDE = SLOTS_PER_POINT * 4; // 52 bytes

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
 * Byte offset of the `angularDensityWeight` slot — the per-galaxy HEALPix
 * angular re-weight used by the Malmquist-bias correction's mode 4.
 *
 * Sits at slot index 12 (offset 48) — the new 13th slot.  Default-baked
 * to 1.0 (multiplicative identity) at upload time so modes 0/1/2/3 see
 * no change.  Real per-galaxy values are spliced in lazily by
 * `applyAngularReweightMode()` the first time the user picks mode 4 in
 * the SettingsPanel, mirroring the lazy-Schechter pattern (see
 * SCHECHTER_RATIO_BYTE_OFFSET above for the same trade-off discussion).
 *
 * ### Why per-vertex
 *
 * The angular weight depends on each galaxy's HEALPix cell + log-distance
 * shell, which in turn depend on the entire cloud's distribution — a
 * uniform can't carry per-galaxy information.  The bake is also
 * deterministic given the cloud (the binning/median pass is pure), so the
 * value is fixed at upload time and a one-shot CPU computation is correct.
 *
 * ### Why baking is fast enough
 *
 * The HEALPix bake is three linear passes over the cloud (geometry derive,
 * count accumulate, weight write) plus one O(N_CELLS · N_SHELLS · log) sort
 * for the per-shell median.  At full GLADE (~2.5 M galaxies) that's
 * ~150 ms total — too slow for the .bin-arrival path (we want that as
 * fast as possible) but fine for a user-initiated mode toggle, especially
 * when shipped to a worker.  The eager-bake path during upload is
 * intentionally NOT supported (see `buildPointInterleavedBuffer.ts`); if
 * the user toggles mode 4 ON, then loads a new survey, the renderer's
 * `applyAngularReweightMode` will spawn the worker for the new source and
 * splice in real weights when it resolves — same lazy semantics as
 * Schechter.
 */
const ANGULAR_WEIGHT_BYTE_OFFSET = 48;

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
 *   bytes 120..123: depthFadeEnabled  u32   (formerly _pad3, now a UI toggle)
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

/**
 * Production path for the off-thread bake.  Spawns a fresh
 * `BuildPointBufferWorker`, ships a *copied* `PointCloud` via `postMessage`'s
 * Transferable list, waits for the message back, and terminates the worker.
 *
 * Why one worker per call?  Parallel survey fetches resolve in unpredictable
 * order, so SDSS can finish baking while 2MRS is mid-bake.  A long-lived
 * worker would have to queue requests internally; a per-call worker has zero
 * shared state and the OS-level concurrency happens automatically.  Worker
 * spawn is cheap (a few ms) compared to the 1–4 s bake itself.
 *
 * The worker transfers the result's `interleaved` and `isFallbackArr`
 * ArrayBuffers back so we don't pay the 14 + 3.5 MB structured-clone copy
 * for the by-far-largest payloads.
 *
 * ### Why we slice-then-transfer the cloud's buffers
 *
 * The first revision of this off-thread refactor passed the input cloud via
 * plain structured clone (`worker.postMessage(input)` with no transfer list).
 * For a fully-loaded SDSS + GLADE deck (~3.5 M galaxies, 100+ MB of typed-
 * array bytes) that synchronous structured clone froze the main thread for
 * **5–10 seconds** before `postMessage` returned, which delayed
 * `onCloudReady` from firing — the status bar showed only "75 points"
 * (Famous catalog) for several seconds before the surveys appeared, even
 * though their `.bin` had already finished decoding.
 *
 * The fix: transfer each typed-array's underlying `ArrayBuffer` via the
 * second argument of `postMessage` (the `Transferable[]` list).  Transfer
 * is zero-copy in microseconds.  Catch: transferring an ArrayBuffer
 * *detaches* it on the sender side — every typed-array view over that
 * buffer becomes a 0-length husk.  But the engine's picker / InfoCard
 * still reads the original cloud's `objIDs`, `magG`, `axisRatio`, etc.
 * after the upload kicks off, so we can't detach those buffers in place.
 *
 * Solution: `slice(0)` each typed array first.  `Float32Array.prototype.
 * slice` (and `BigUint64Array.prototype.slice`) returns a fresh typed
 * array backed by a *new* owned `ArrayBuffer` with the same contents —
 * a one-shot main-thread memcpy of ~50 ms for 100 MB (cheap compared to
 * the 5+ s structured clone we paid before).  We then transfer the
 * cloned buffers, leaving the original cloud completely intact for the
 * picker / InfoCard.
 *
 * The trade-off: copy + transfer is strictly more work than transfer
 * alone (~50 ms vs ~0 ms), but strictly less than structured clone (~50
 * ms vs ~5 s).  We can't transfer the original buffers because the
 * engine retains the cloud — see `cloudLoader.ts` and the picker's
 * `cloud.magG[i]` reads in `engine.ts`'s hover/click handlers.
 *
 * Alternative considered (and rejected for now): split `PointCloud`
 * into a "core" (positions, magG, axisRatio, PA, diameterKpc — what
 * the bake needs) and "pickerOnly" (objIDs + the other photometry
 * bands), keeping the picker-only arrays out of the worker entirely.
 * That would skip the slice cost on the picker-only arrays, but every
 * call site that reads the cloud would need to know which slice to
 * touch.  Cleaner copy-then-transfer is good enough for now (50 ms is
 * imperceptible) — revisit if profiling shows the memcpy itself
 * blocking the UI.
 */
function defaultWorkerRunner(
  input: BuildPointInterleavedBufferInput,
): Promise<BuildPointInterleavedBufferResult> {
  return new Promise((resolve, reject) => {
    const worker = new BuildPointBufferWorker();
    worker.onmessage = (event: MessageEvent<BuildPointInterleavedBufferResult>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message ?? 'point-bake worker error'));
    };

    // Slice every typed array's underlying buffer so we own a fresh,
    // detachable copy.  `.slice(0)` on a typed array returns a NEW typed
    // array whose `.buffer` is a fresh ArrayBuffer — distinct from the
    // engine-owned cloud's buffers.  We can therefore transfer these
    // safely without detaching anything the rest of the app reads.
    //
    // Note on BigUint64Array: even though BigUint64Array itself is NOT on
    // the Transferable allowlist, its underlying `.buffer` (a plain
    // ArrayBuffer) IS — and the worker reconstructs a BigUint64Array
    // view over the received buffer via the structured-clone roundtrip
    // of the typed-array wrapper.  Structured clone correctly serialises
    // typed-array views over transferred buffers (HTML spec §StructuredSerialize
    // step "If value has [[ArrayBufferData]]…").
    const c = input.cloud;
    const cloudCopy: PointCloud = {
      count: c.count,
      objIDs: new BigUint64Array(c.objIDs.buffer.slice(0)),
      positions: new Float32Array(c.positions.buffer.slice(0)),
      magU: new Float32Array(c.magU.buffer.slice(0)),
      magG: new Float32Array(c.magG.buffer.slice(0)),
      magR: new Float32Array(c.magR.buffer.slice(0)),
      magI: new Float32Array(c.magI.buffer.slice(0)),
      magZ: new Float32Array(c.magZ.buffer.slice(0)),
      axisRatio: new Float32Array(c.axisRatio.buffer.slice(0)),
      positionAngleDeg: new Float32Array(c.positionAngleDeg.buffer.slice(0)),
      diameterKpc: new Float32Array(c.diameterKpc.buffer.slice(0)),
    };
    const transfer: Transferable[] = [
      cloudCopy.objIDs.buffer,
      cloudCopy.positions.buffer,
      cloudCopy.magU.buffer,
      cloudCopy.magG.buffer,
      cloudCopy.magR.buffer,
      cloudCopy.magI.buffer,
      cloudCopy.magZ.buffer,
      cloudCopy.axisRatio.buffer,
      cloudCopy.positionAngleDeg.buffer,
      cloudCopy.diameterKpc.buffer,
    ];
    worker.postMessage({ ...input, cloud: cloudCopy }, transfer);
  });
}

/**
 * Production path for the lazy Schechter-ratio bake.  Spawns a fresh
 * `ComputeSchechterRatiosWorker`, ships a *copied* `PointCloud` (slice-then-
 * transfer pattern, same as the main vertex bake — see
 * `defaultWorkerRunner`'s long comment for why), waits for the resulting
 * `Float32Array`, and terminates the worker.
 *
 * Why copy-then-transfer?  Same reason as the vertex-bake worker: the
 * picker / InfoCard still reads the engine's authoritative `cloud` after
 * we kick off the bake, so we can't detach those buffers in place.
 * `slice(0)` mints owned copies that are safe to transfer without
 * detaching anything else.
 *
 * Cost: ~50 ms memcpy for a 100 MB SDSS+GLADE deck (much cheaper than the
 * 5+ s structured clone the original revision paid before adding the
 * Transferable list).  The worker itself takes 1–2 s to chew through the
 * Schechter integral; the slice cost is in the noise.
 */
function defaultSchechterWorkerRunner(
  input: ComputeSchechterRatiosInput,
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const worker = new ComputeSchechterRatiosWorker();
    worker.onmessage = (event: MessageEvent<Float32Array>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(
        event.error ??
          new Error(event.message ?? 'schechter-ratio worker error'),
      );
    };

    // Slice-then-transfer the typed-array buffers (see the long comment
    // on `defaultWorkerRunner` above for the full rationale — same
    // ownership concern applies here, since the engine retains the
    // original cloud for picker/InfoCard reads).
    const c = input.cloud;
    const cloudCopy: PointCloud = {
      count: c.count,
      objIDs: new BigUint64Array(c.objIDs.buffer.slice(0)),
      positions: new Float32Array(c.positions.buffer.slice(0)),
      magU: new Float32Array(c.magU.buffer.slice(0)),
      magG: new Float32Array(c.magG.buffer.slice(0)),
      magR: new Float32Array(c.magR.buffer.slice(0)),
      magI: new Float32Array(c.magI.buffer.slice(0)),
      magZ: new Float32Array(c.magZ.buffer.slice(0)),
      axisRatio: new Float32Array(c.axisRatio.buffer.slice(0)),
      positionAngleDeg: new Float32Array(c.positionAngleDeg.buffer.slice(0)),
      diameterKpc: new Float32Array(c.diameterKpc.buffer.slice(0)),
    };
    const transfer: Transferable[] = [
      cloudCopy.objIDs.buffer,
      cloudCopy.positions.buffer,
      cloudCopy.magU.buffer,
      cloudCopy.magG.buffer,
      cloudCopy.magR.buffer,
      cloudCopy.magI.buffer,
      cloudCopy.magZ.buffer,
      cloudCopy.axisRatio.buffer,
      cloudCopy.positionAngleDeg.buffer,
      cloudCopy.diameterKpc.buffer,
    ];
    worker.postMessage({ ...input, cloud: cloudCopy }, transfer);
  });
}

/**
 * Production path for the lazy HEALPix angular re-weight bake.  Spawns a
 * fresh `ComputeAngularWeightsWorker`, ships a copied `PointCloud` (slice-
 * then-transfer pattern, mirror of `defaultSchechterWorkerRunner`), waits
 * for the resulting `Float32Array`, and terminates the worker.
 *
 * The bake itself is three linear passes through the cloud's positions plus
 * a per-shell median sort; ~100-300 ms at full deck.  Worker spawn
 * (~few ms) is the right trade-off — even though the bake isn't as
 * dramatically expensive as the Schechter integral, dropping a frame on
 * mode toggle would feel sluggish.
 */
function defaultAngularWeightsWorkerRunner(
  input: ComputeAngularWeightsInput,
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const worker = new ComputeAngularWeightsWorker();
    worker.onmessage = (event: MessageEvent<Float32Array>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(
        event.error ??
          new Error(event.message ?? 'angular-weights worker error'),
      );
    };

    // Slice-then-transfer the typed-array buffers (see the long comment on
    // `defaultWorkerRunner` above for the rationale — the engine retains
    // the original cloud for picker / InfoCard reads, so we can't detach
    // those buffers in place).
    const c = input.cloud;
    const cloudCopy: PointCloud = {
      count: c.count,
      objIDs: new BigUint64Array(c.objIDs.buffer.slice(0)),
      positions: new Float32Array(c.positions.buffer.slice(0)),
      magU: new Float32Array(c.magU.buffer.slice(0)),
      magG: new Float32Array(c.magG.buffer.slice(0)),
      magR: new Float32Array(c.magR.buffer.slice(0)),
      magI: new Float32Array(c.magI.buffer.slice(0)),
      magZ: new Float32Array(c.magZ.buffer.slice(0)),
      axisRatio: new Float32Array(c.axisRatio.buffer.slice(0)),
      positionAngleDeg: new Float32Array(c.positionAngleDeg.buffer.slice(0)),
      diameterKpc: new Float32Array(c.diameterKpc.buffer.slice(0)),
    };
    const transfer: Transferable[] = [
      cloudCopy.objIDs.buffer,
      cloudCopy.positions.buffer,
      cloudCopy.magU.buffer,
      cloudCopy.magG.buffer,
      cloudCopy.magR.buffer,
      cloudCopy.magI.buffer,
      cloudCopy.magZ.buffer,
      cloudCopy.axisRatio.buffer,
      cloudCopy.positionAngleDeg.buffer,
      cloudCopy.diameterKpc.buffer,
    ];
    worker.postMessage({ ...input, cloud: cloudCopy }, transfer);
  });
}

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
   * Mirror of the interleaved Float32Array baked into `buffer` at upload
   * time.  Held on the JS side so `applySchechterMode()` can splice fresh
   * Schechter ratios into slot 11 of every row and re-upload the whole
   * buffer with one `device.queue.writeBuffer` call — see that method's
   * doc for why this is faster than N sparse writes.
   *
   * Memory cost: ~14 MB per fully-loaded SDSS deck.  Dwarfed by the
   * cloud's own struct-of-arrays (~100 MB), so this isn't a budget
   * concern.  The mirror is freed when the source unloads.
   */
  interleaved: Float32Array;
  /**
   * Cached per-galaxy Schechter ratios, populated lazily the first time
   * the user selects `BiasMode.Schechter`.  Once populated, subsequent
   * toggles reuse this array — re-toggling Schechter mode is then
   * instant (no worker spawn, just a single writeBuffer call).
   *
   * `null` until the first `applySchechterMode()` call resolves for
   * this source.  Callers must check before using.
   */
  cachedSchechterRatios: Float32Array | null;
  /**
   * Cached per-galaxy HEALPix angular re-weights, populated lazily the
   * first time the user selects `BiasMode.AngularReweight` (mode 4).
   * Mirrors `cachedSchechterRatios` exactly: once populated, subsequent
   * mode-4 toggles reuse this array for an instant flip (single
   * writeBuffer call), so the user pays the bake cost once per session
   * per source.
   *
   * `null` until the first `applyAngularReweightMode()` call resolves
   * for this source.  Callers must check before using.
   */
  cachedAngularWeights: Float32Array | null;
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

  /**
   * Whether the engine has currently selected `BiasMode.Schechter`.  Drives
   * two things:
   *
   *   1. New uploads while this is `true` bake the Schechter ratios
   *      eagerly (so a survey that arrives mid-Schechter renders correctly
   *      from frame 1).
   *   2. `applySchechterMode()` and `clearSchechterRatios()` flip this flag
   *      so the renderer's view of "is Schechter active?" stays
   *      authoritative — the engine's `setBiasMode` call site doesn't
   *      forward the mode itself, just the on/off intent.
   *
   * Default `false`: a fresh renderer assumes the default bias mode (None),
   * matching `engine.ts`'s initial `let biasMode: BiasMode = BiasMode.None`.
   */
  private schechterModeActive = false;

  /**
   * Whether the engine has currently selected `BiasMode.AngularReweight`.
   * Mirrors `schechterModeActive` exactly — flipped by
   * `applyAngularReweightMode()` and `clearAngularWeights()` so a new
   * upload arriving while mode 4 is active can know to bake the weights
   * eagerly (currently we don't — see `buildPointInterleavedBuffer.ts`'s
   * slot-12 comment — but the flag is here for symmetry and so the same
   * triggering pattern stays familiar across modes).
   */
  private angularReweightModeActive = false;

  /**
   * Static factory for the lazy Schechter-ratio worker.  Production path
   * spawns a Vite `?worker` chunk; Node tests can override with a
   * synchronous in-process runner via
   * `PointRenderer.setSchechterRatioRunner(...)`.  Same pattern as
   * `setBuildBufferRunner` for the main bake.
   */
  private static schechterRunner: (
    input: ComputeSchechterRatiosInput,
  ) => Promise<Float32Array> = defaultSchechterWorkerRunner;

  /**
   * Override the Schechter-ratio runner — used by tests that can't load the
   * Vite `?worker` import.  Pass a synchronous function that runs the pure
   * `computeSchechterRatios` directly, or `null` to restore the default.
   */
  static setSchechterRatioRunner(
    runner:
      | ((input: ComputeSchechterRatiosInput) => Promise<Float32Array>)
      | null,
  ): void {
    PointRenderer.schechterRunner = runner ?? defaultSchechterWorkerRunner;
  }

  /**
   * Static factory for the lazy HEALPix angular-reweight worker.  Production
   * path spawns a Vite `?worker` chunk; Node tests can override with a
   * synchronous in-process runner via `setAngularWeightRunner(...)`.  Same
   * pattern as `setSchechterRatioRunner`.
   */
  private static angularRunner: (
    input: ComputeAngularWeightsInput,
  ) => Promise<Float32Array> = defaultAngularWeightsWorkerRunner;

  /**
   * Override the angular-reweight runner — used by tests that can't load
   * the Vite `?worker` import.  Pass a synchronous function that runs the
   * pure `computeAngularWeights` directly, or `null` to restore the default.
   */
  static setAngularWeightRunner(
    runner:
      | ((input: ComputeAngularWeightsInput) => Promise<Float32Array>)
      | null,
  ): void {
    PointRenderer.angularRunner = runner ?? defaultAngularWeightsWorkerRunner;
  }

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
              // angularDensityWeight (f32) — offset 48 bytes.  Per-galaxy
              // HEALPix angular re-weight baked at upload time as 1.0 (the
              // multiplicative identity), then lazily replaced with real
              // per-galaxy values when the user toggles
              // `BiasMode.AngularReweight`.  Read by the fragment shader's
              // alpha computation, gated on `u.biasMode == 4u` via a
              // `select(1.0, angularDensityWeight, …)` so the other four
              // modes are unaffected.  See ANGULAR_WEIGHT_BYTE_OFFSET above
              // for the design notes.
              { shaderLocation: 10, offset: ANGULAR_WEIGHT_BYTE_OFFSET, format: 'float32' },
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
   * source.  Replaces any previous buffer for that source.
   *
   * ### Why this is async
   *
   * The per-galaxy bake (per-survey magG mean, fallback-orientation hash,
   * Schechter integral, 1/V_max weight, K-correction lookup) used to run on
   * the main thread inside this method.  For a fully-loaded SDSS + 2MRS +
   * GLADE deck (~3.5 M galaxies) the loop took ~10 seconds — and it
   * happened right when the user expected the UI to come alive.  The fix
   * was structural: move the bake off-thread.  See
   * `buildPointInterleavedBuffer.ts` and its `.worker.ts` sibling for the
   * full rationale (structured-clone vs Transferable, per-call worker
   * lifecycle, etc.).
   *
   * The upload now: spawns a fresh worker, ships the cloud + source +
   * priorCount via structured clone, awaits the result, then writes the
   * returned `interleaved` buffer to GPU memory and updates bookkeeping.
   * The worker's transferred ArrayBuffer becomes invalid on the worker
   * side after the message — fine because the worker terminates anyway.
   *
   * ### Why we destroy the old buffer for this source first
   *
   * GPU buffers are fixed-size — there is no `realloc`.  If the user loads
   * a different file for an already-present source, the new cloud may have
   * a different point count, so we throw away the old buffer and allocate
   * a new one.  `GPUBuffer.destroy()` releases the VRAM immediately.
   *
   * ### Race-condition behaviour
   *
   * If `upload(source, cloudA)` is in flight (worker baking) and a second
   * `upload(source, cloudB)` fires for the same source, both spawn their
   * own workers.  Whichever completes LAST wins — its `clouds.set` call
   * overwrites the first's entry, and the loser's GPU buffer (already
   * allocated by then) is leaked until the next upload destroys it.  This
   * is the simplest correct semantics for "user reloaded a survey while
   * the previous version was still uploading".  In practice we only see
   * one upload per source per session, so the leak is theoretical.
   *
   * @param source  Which survey the cloud belongs to.
   * @param cloud   Point cloud to upload (struct-of-arrays SDSS v2 shape).
   */
  async upload(source: Source, cloud: PointCloud): Promise<void> {
    // ── Compute the source's prior-count BEFORE the worker spawns ───────────
    //
    // The worker can't reach back into `this.clouds` to compute the priorCount
    // itself — Map<Source, LoadedSource> isn't structured-cloneable (it
    // contains GPUBuffer references which are not clonable), and even if it
    // were the worker would lock in a snapshot at message time anyway.  We
    // therefore compute the integer here on the main thread and ship it to
    // the worker as a single number.
    //
    // Edge case unchanged from the inline-version: if an *earlier* source (in
    // enum order) is uploaded after this one, this source's offset shifts
    // forward but the values already baked here do not.  The
    // `rebakeStaleSources` pass below catches the divergence and re-uploads
    // the affected sources with the corrected priorCount.
    const countsBySource = new Map<Source, number>();
    for (const [src, entry] of this.clouds) {
      countsBySource.set(src, entry.count);
    }
    const priorCount = computePriorCount(source, countsBySource);

    // ── Run the bake off-thread ─────────────────────────────────────────────
    //
    // `runBuild` either spawns a fresh Web Worker (production path) or runs
    // the pure function inline (Node test path — see the static factory
    // override).  Either way we await a `BuildPointInterleavedBufferResult`.
    // Each upload uses its own worker instance: parallel surveys can bake
    // simultaneously, and there's no shared-state cleanup between calls.
    //
    // Mode = 'fast' unless Schechter is currently the active bias mode.  We
    // never want to do the per-galaxy integral at upload unless the user
    // is actively viewing mode 3, since the shader's `select(1.0, …, mode==3)`
    // gate makes the slot irrelevant in modes 0/1/2.  See the
    // `BuildPointInterleavedBufferMode` doc for the trade-off.
    const mode: BuildPointInterleavedBufferMode =
      this.schechterModeActive ? 'with-schechter' : 'fast';
    const result = await PointRenderer.runBuild({
      cloud,
      source,
      priorCount,
      mode,
    });
    const { interleaved, schechter, mLim, nRef } = result;

    // ── Write to GPU ────────────────────────────────────────────────────────
    //
    // Destroy any previous buffer for this source before replacing it (GPU
    // buffers can't be realloc'd; allocating a fresh one of the new size and
    // letting the old one's VRAM go is the only path).
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
    // If the upload was 'with-schechter', extract the per-row ratios from
    // slot 11 of the freshly-baked interleaved array and cache them — this
    // way a subsequent toggle Schechter→other→Schechter doesn't need to
    // re-spawn the worker.
    let cachedSchechterRatios: Float32Array | null = null;
    if (mode === 'with-schechter') {
      cachedSchechterRatios = new Float32Array(cloud.count);
      for (let i = 0; i < cloud.count; i++) {
        cachedSchechterRatios[i] = interleaved[i * SLOTS_PER_POINT + 11]!;
      }
    }

    this.clouds.set(source, {
      buffer,
      count: cloud.count,
      instanceIdOffset: priorCount,
      bakedPriorCount: priorCount,
      cloud,
      schechter,
      mLim,
      nRef,
      interleaved,
      cachedSchechterRatios,
      // Angular weights are never eagerly baked (see slot-12 comment in
      // buildPointInterleavedBuffer.ts); the upload always writes 1.0 and
      // the cache stays empty until `applyAngularReweightMode()` runs.
      cachedAngularWeights: null,
    });
    this.recomputeInstanceIdOffsets();
    await this.rebakeStaleSources();
  }

  /**
   * Static factory for the off-thread bake.  Production path spawns a Vite
   * `?worker` chunk; Node tests can override with a synchronous in-process
   * runner via `PointRenderer.setBuildBufferRunner(...)`.
   *
   * Defined as a static field rather than an instance method so the worker
   * import lives at module scope (Vite's `?worker` plugin can statically
   * resolve it that way) and so a single override flips the behaviour for
   * every renderer in the test suite.
   */
  private static buildRunner: (
    input: BuildPointInterleavedBufferInput,
  ) => Promise<BuildPointInterleavedBufferResult> = defaultWorkerRunner;

  /**
   * Override the bake runner — used by tests that can't load the Vite
   * `?worker` import (the Node-side vitest environment doesn't have a
   * Worker constructor).  Pass a synchronous function that runs the pure
   * `buildPointInterleavedBuffer` directly, or `null` to restore the
   * worker-based default.
   */
  static setBuildBufferRunner(
    runner:
      | ((input: BuildPointInterleavedBufferInput) => Promise<BuildPointInterleavedBufferResult>)
      | null,
  ): void {
    PointRenderer.buildRunner = runner ?? defaultWorkerRunner;
  }

  /** Convenience wrapper used by `upload()` and `rebakeStaleSources`. */
  private static runBuild(
    input: BuildPointInterleavedBufferInput,
  ): Promise<BuildPointInterleavedBufferResult> {
    return PointRenderer.buildRunner(input);
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
  private async rebakeStaleSources(): Promise<void> {
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
          //
          // We `await` so each rebake completes before the next iteration —
          // otherwise a second source's rebake could see the in-flight
          // first source's stale `instanceIdOffset` and trigger an
          // unnecessary cascade.  In practice this loop visits at most one
          // stale source per call, so the serialisation costs nothing.
          await this.upload(s, entry.cloud);
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

  // ─── Lazy Schechter-ratio bake ──────────────────────────────────────────────

  /**
   * Compute and upload per-galaxy Schechter ratios for every loaded source.
   *
   * Called by the engine when the user transitions TO `BiasMode.Schechter`.
   * The work is potentially expensive (~700 M math ops for a fully-loaded
   * deck), so we run it off-thread in a per-source worker — the renderer's
   * per-frame `draw()` keeps using the current (1.0) slot value until the
   * worker resolves, at which point the buffer flips to the real ratios.
   *
   * ### Why a full-buffer re-upload, not sparse writes
   *
   * WebGPU has no scatter-write primitive.  We could issue one
   * `device.queue.writeBuffer` per galaxy (3.5 M calls at 4 bytes each) but
   * that's measurably slower than a single full-buffer write — every
   * `writeBuffer` carries syscall overhead.  Strided writes also don't
   * help: WebGPU's `writeBuffer` only takes a contiguous source range.
   *
   * The right approach is to keep a JS-side mirror of the interleaved
   * vertex bytes (already populated at upload time), splice fresh ratios
   * into slot 11 of every row, and re-upload the whole thing in one call.
   * Cost: ~50 ms PCIe transfer for 17 MB SDSS — imperceptible against
   * the user's "I picked Schechter mode" click latency budget.
   *
   * ### Caching
   *
   * The first call per source spawns a worker; subsequent calls reuse the
   * `cachedSchechterRatios` Float32Array on the LoadedSource entry.  This
   * makes Schechter→other→Schechter toggles instant — only the initial
   * "first time the user picks Schechter" pays the integral cost.
   *
   * ### Concurrency
   *
   * Workers for different sources spawn in parallel; we await all of them
   * with `Promise.all`.  If a new source loads mid-bake the renderer's
   * `upload()` will see `schechterModeActive === true` and bake the new
   * source eagerly with mode = 'with-schechter', so no second pass is
   * needed for that source.
   *
   * Fire-and-forget from the engine side: the per-frame draw loop
   * continues uninterrupted while ratios compute.  Errors are surfaced
   * via the returned promise's rejection.
   */
  async applySchechterMode(): Promise<void> {
    this.schechterModeActive = true;

    // Collect the work items first so we don't iterate `this.clouds` while
    // any async path could mutate it (an `unload` between sources would
    // skip the rest, but at least we won't crash).
    const sources: { source: Source; entry: LoadedSource }[] = [];
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      sources.push({ source, entry });
    }

    await Promise.all(
      sources.map(async ({ source, entry }) => {
        // Cache hit: reuse the previously-computed ratios.  Still need to
        // splice them into the mirror + re-upload because the buffer might
        // currently hold the all-1.0 values from a `clearSchechterRatios`
        // round trip.
        let ratios = entry.cachedSchechterRatios;
        if (!ratios) {
          ratios = await PointRenderer.schechterRunner({
            cloud: entry.cloud,
            source,
          });
          // Re-fetch the entry — `unload()` could have removed the source
          // while the worker was running; in that case we drop the result.
          const live = this.clouds.get(source);
          if (!live || live !== entry) return;
          entry.cachedSchechterRatios = ratios;
        }

        this.spliceSchechterIntoMirror(entry, ratios);
        this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
      }),
    );
  }

  /**
   * Reset slot 11 of every loaded source's vertex buffer to the
   * multiplicative identity (1.0).
   *
   * Cheap because the shader's `select(1.0, schechterRatio, biasMode == 3u)`
   * gate already ignores slot 11 in modes 0/1/2 — strictly speaking we
   * don't NEED to clear the buffer.  We expose this method anyway for
   * symmetry and so a future debug overlay can verify the slot's contents
   * without surprises.
   *
   * Engine's `setBiasMode` typically does NOT call this on transition AWAY
   * from Schechter — leaving the values in the buffer is harmless and
   * keeps the next Schechter toggle even faster (no writeBuffer cost).
   */
  clearSchechterRatios(): void {
    this.schechterModeActive = false;
    for (const entry of this.clouds.values()) {
      // Splice all-1.0 into slot 11 of the mirror, re-upload.  We don't
      // build a separate "ones" Float32Array — a simple loop is fine
      // since this is invoked at most a few times per session.
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 11] = 1.0;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  /**
   * Splice a tightly-packed Float32Array of per-row ratios (length =
   * entry.count) into slot 11 of every row of the entry's interleaved
   * mirror.  Pure function over the mirror buffer — no GPU calls.
   *
   * Extracted as a private helper so `applySchechterMode` (cache-hit and
   * worker-resolve paths) can share the same loop without duplicating the
   * stride math.  The caller is responsible for the subsequent
   * `writeBuffer` upload to the GPU.
   */
  private spliceSchechterIntoMirror(
    entry: LoadedSource,
    ratios: Float32Array,
  ): void {
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 11] = ratios[i]!;
    }
  }

  // ─── Lazy HEALPix angular re-weight bake ────────────────────────────────────

  /**
   * Compute and upload per-galaxy HEALPix angular re-weights for every
   * loaded source.  Mirrors `applySchechterMode()` exactly — same lazy
   * pattern, same per-source caching, same single-buffer-rewrite upload.
   *
   * Called by the engine when the user transitions TO
   * `BiasMode.AngularReweight`.  The work is moderate (~100-300 ms at
   * full deck), so we run it off-thread in a per-source worker — the
   * renderer's per-frame `draw()` keeps using the current 1.0 default
   * until the worker resolves, at which point the buffer flips to the
   * real per-galaxy weights.
   *
   * ### Why per-survey LUTs (and never a global one)
   *
   * Each cloud is binned independently.  Combining surveys would let
   * SDSS's footprint contaminate GLADE's correction (and vice versa),
   * defeating the whole point of mode 4: GLADE's pencil-beam-jet artefact
   * is specifically GLADE's, and re-weighting GLADE against SDSS-density-
   * landscape would do almost nothing because SDSS is already
   * (relatively) uniform within its footprint.
   *
   * ### Caching
   *
   * Same as Schechter: the first call per source spawns a worker;
   * subsequent calls reuse the `cachedAngularWeights` Float32Array on the
   * LoadedSource entry.  Mode 4→other→mode 4 toggles are then instant.
   *
   * ### Concurrency
   *
   * Workers for different sources spawn in parallel via `Promise.all`.
   * Fire-and-forget from the engine side: the per-frame draw loop
   * continues uninterrupted while weights compute.  Errors surface via
   * the returned promise's rejection.
   */
  async applyAngularReweightMode(): Promise<void> {
    this.angularReweightModeActive = true;

    // Snapshot the work items so an async unload mid-bake can't crash us
    // (it'll just skip the ones it should — see the live-entry check below).
    const sources: { source: Source; entry: LoadedSource }[] = [];
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      sources.push({ source, entry });
    }

    await Promise.all(
      sources.map(async ({ source, entry }) => {
        // Cache hit: reuse the previously-computed weights.  Still need to
        // splice them into the mirror + re-upload because the buffer might
        // currently hold the all-1.0 values from a `clearAngularWeights`
        // round trip.
        let weights = entry.cachedAngularWeights;
        if (!weights) {
          weights = await PointRenderer.angularRunner({
            cloud: entry.cloud,
            source,
          });
          // Re-fetch — `unload()` might have removed the source while the
          // worker was running; in that case we drop the result.
          const live = this.clouds.get(source);
          if (!live || live !== entry) return;
          entry.cachedAngularWeights = weights;
        }

        this.spliceAngularIntoMirror(entry, weights);
        this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
      }),
    );
  }

  /**
   * Reset slot 12 of every loaded source's vertex buffer to the
   * multiplicative identity (1.0).
   *
   * Cheap because the shader's `select(1.0, angularDensityWeight, biasMode == 4u)`
   * gate already ignores slot 12 in modes 0/1/2/3 — strictly speaking we
   * don't NEED to clear the buffer.  Mirrors `clearSchechterRatios()`
   * exactly: the engine's `setBiasMode` typically does NOT call this on
   * transition AWAY from mode 4, since leaving the values in place keeps
   * the next mode-4 toggle even faster (no writeBuffer cost).
   */
  clearAngularWeights(): void {
    this.angularReweightModeActive = false;
    for (const entry of this.clouds.values()) {
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 12] = 1.0;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  /**
   * Splice a tightly-packed Float32Array of per-row angular weights
   * (length = entry.count) into slot 12 of every row of the entry's
   * interleaved mirror.  Mirror of `spliceSchechterIntoMirror`.
   */
  private spliceAngularIntoMirror(
    entry: LoadedSource,
    weights: Float32Array,
  ): void {
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 12] = weights[i]!;
    }
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
    depthFadeEnabled: boolean,
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
    u32[30] = depthFadeEnabled  ? 1 : 0; // bytes 120..123  depthFadeEnabled (formerly _pad3)
    // u32[31] (_pad4) stays zero.

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
