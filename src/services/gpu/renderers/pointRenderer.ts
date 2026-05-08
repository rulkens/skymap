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
 * Per-source draw calls also feed the picker its (sourceCode, localIdx)
 * packing: each source's `@group(1)` CloudFade bind group carries a 5-bit
 * `sourceCode` that the vertex stage composes with `@builtin(instance_index)`
 * into each fragment's packed identity, written into the r32uint pick
 * texture by `fsPick`.  No more cross-source running-sum bake.
 *
 * ### Relationship to other modules
 *
 *   PointCloud  →  upload(source, …)    →  GPU vertex buffer per source
 *   OrbitCamera →  computeViewProj()    →  draw()  →  uniform buffer  (every frame)
 *
 * @module
 */

import { mat4 } from 'gl-matrix';
import type { PointCloud } from '../../../@types';
import { ALL_SOURCES, Source } from '../../../data/sources';
import { BiasMode } from '../../../data/biasMode';
import { type SchechterTriple } from '../../../data/surveyFluxLimits';
import {
  type BuildPointInterleavedBufferInput,
  type BuildPointInterleavedBufferMode,
  type BuildPointInterleavedBufferResult,
} from '../../engine/bake/buildPointInterleavedBuffer';

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
import BuildPointBufferWorker from '../../engine/bake/buildPointInterleavedBuffer.worker?worker';

// Lazy-Schechter worker import — same `?worker` Vite suffix as the main
// vertex bake, but for the much smaller (single Float32Array) Schechter
// integral.  Spawned by `setBiasMode(BiasMode.Schechter)` the first time
// the user selects that mode; subsequent toggles reuse the cached
// `Float32Array` per source for instant re-toggle.
import ComputeSchechterRatiosWorker from '../../engine/bake/computeSchechterRatios.worker?worker';
import { type ComputeSchechterRatiosInput } from '../../engine/bake/computeSchechterRatios';

// Lazy-angular-reweight worker import — same `?worker` Vite suffix.  The
// HEALPix bake is much cheaper than the Schechter integral (~100-300 ms for
// a full deck vs 1-2 s) but still long enough to drop a frame, so we
// off-thread it for parity with the other lazy bakes.  Spawned by
// `setBiasMode(BiasMode.AngularReweight)` the first time the user picks
// that mode; subsequent toggles reuse `cachedAngularWeights` for instant
// re-toggle.
import ComputeAngularWeightsWorker from '../../engine/bake/computeAngularWeights.worker?worker';
import { type ComputeAngularWeightsInput } from '../../engine/bake/computeAngularWeights';

// `?static` is wesl-plugin's Vite import suffix. It runs the WESL linker at
// build time and hands us a plain WGSL string with all `import` statements
// resolved into top-level functions. We forward that string straight to
// `device.createShaderModule({ code: shaderSrc })`. The previous `?raw`
// suffix bypassed the linker entirely and worked only because the legacy
// .wgsl source was self-contained — once we extract shared modules under
// `shaders/lib/`, `?static` is required.
//
// The points shader was split into four files (Task 13 of the WGSL→WESL
// conversion plan): `points/io.wesl` (shared structs), `points/vertex.wesl`
// (the `vs` entry point shared with PickRenderer), `points/colorFragment.wesl`
// (the visual `fs` entry point — this renderer), and `points/pickFragment.wesl`
// (PickRenderer's `fsPick`). Each pipeline now compiles its own vertex +
// fragment GPUShaderModule from disjoint sources, eliminating a class of
// selection-on-wrong-galaxy bugs that came from one shader module servicing
// two pipelines with diverging fragment paths.
import vsCode from '../shaders/points/vertex.wesl?static';
import colorFsCode from '../shaders/points/colorFragment.wesl?static';
import { CloudFade } from '../resources/cloudFade';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * Number of 4-byte slots packed per catalog point in the vertex buffer.
 *
 * Layout (matches the `PerVertex` struct in points.wgsl):
 *   [x f32, y f32, z f32,
 *    magnitude f32, colorIndex f32,
 *    kPerZ f32,
 *    axisRatio f32 (sign bit = isFallback flag),
 *    positionAngleDeg f32, diameterKpc f32,
 *    vMaxWeight f32, schechterRatio f32, angularDensityWeight f32]
 *
 * Every slot is f32 from the GPU's perspective; the single bit of "is
 * this row a fallback orientation?" rides on the sign bit of axisRatio.
 *
 * ### Identity encoding (post (source, localIdx) packing refactor)
 *
 * The previous revision baked a per-instance `globalInstanceIdx u32`
 * carrying the running-sum-of-prior-source-counts global ID + a
 * fallback-flag piggyback on the high bit.  Both went away with this
 * refactor:
 *
 *   - The picker now writes `(sourceCode << 27) | localIdx + 1` from the
 *     fragment, where `sourceCode` is a per-draw uniform (5 bits, see
 *     `SOURCE_CODE_OFFSET` below) and `localIdx` is the GPU's
 *     `@builtin(instance_index)`.  No per-vertex baking needed; each
 *     survey's identity range is structurally disjoint by construction
 *     (top 5 bits = source code, never overlap).
 *   - The fallback flag rides on the sign bit of axisRatio (real
 *     measurements are always positive; a negative value flags
 *     fallback orientation).
 *
 * Net result: vertex stride shrinks from 52 → 48 bytes, and the
 * parallel-upload race that the old global-ID baking suffered from is
 * structurally impossible.
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
 * Byte offset of the `kPerZ` slot inside one per-instance record.
 *
 * Sits at slot index 5 (offset 20).  Per-row K-correction coefficient
 * (see colourIndex.ts).  The shader multiplies it by redshift `z` to
 * obtain the per-point K shift.
 */
const K_PER_Z_BYTE_OFFSET = 20;

/**
 * Byte offset of the `axisRatio` slot — the b/a ratio of the galaxy disk.
 *
 * Sits at slot index 6 (offset 24).  The fragment shader uses
 * `abs(axisRatio)` to squash the unit-circle UV mask into an ellipse;
 * the sign bit doubles as the fallback-orientation flag (real
 * measurements are positive; a negative value flags a fallback row).
 */
const AXIS_RATIO_BYTE_OFFSET = 24;

/**
 * Byte offset of the `positionAngleDeg` slot — the east-of-north position
 * angle of the galaxy disk's major axis, in degrees [0, 180).
 *
 * Sits at slot index 7 (offset 28).  The fragment shader rotates the
 * squashed ellipse around the billboard centre by this angle.
 */
const POSITION_ANGLE_BYTE_OFFSET = 28;

/**
 * Byte offset of the `diameterKpc` slot — the per-galaxy physical disk
 * diameter in kiloparsecs.
 *
 * Sits at slot index 8 (offset 32).  The vertex shader uses it to
 * compute each billboard's apparent angular radius from
 * `(diameterKpc / 1000 / 2) / distance_Mpc`.
 */
const DIAMETER_KPC_BYTE_OFFSET = 32;

/**
 * Byte offset of the `vMaxWeight` slot — the per-galaxy 1/V_max alpha
 * multiplier used by the Malmquist-bias correction's mode 2.
 *
 * Sits at slot index 9 (offset 36).  Baked at upload time from each
 * galaxy's apparent magnitude, Cartesian distance and the survey's flux
 * limit.
 */
const VMAX_WEIGHT_BYTE_OFFSET = 36;

/**
 * Byte offset of the `schechterRatio` slot — the per-galaxy Schechter
 * density-correction ratio used by the Malmquist-bias correction's mode 3.
 *
 * Sits at slot index 10 (offset 40).  Default 1.0 in fast mode; real
 * ratios spliced in lazily when the user picks mode 3.
 */
const SCHECHTER_RATIO_BYTE_OFFSET = 40;

/**
 * Byte offset of the `angularDensityWeight` slot — the per-galaxy HEALPix
 * angular re-weight used by the Malmquist-bias correction's mode 4.
 *
 * Sits at slot index 11 (offset 44).  Default-baked to 1.0
 * (multiplicative identity) at upload time so modes 0/1/2/3 see no
 * change.  Real per-galaxy values are spliced in lazily by
 * `setBiasMode(BiasMode.AngularReweight)` the first time the user picks
 * mode 4 in the SettingsPanel, mirroring the lazy-Schechter pattern (see
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
 * `setBiasMode` will spawn the worker for the new source and splice in
 * real weights when it resolves — same lazy semantics as Schechter.
 */
const ANGULAR_WEIGHT_BYTE_OFFSET = 44;

// ─── Uniform buffer byte offsets (per-pass partial writes) ──────────────────

/**
 * Byte offset of the `selectedPacked` u32 slot inside the per-frame uniform
 * buffer.  The picker writes the "no selection" sentinel here at the top of
 * every pick pass so its 8× selection-ring scaling doesn't bleed into the
 * pick area, and `renderFrame` writes the live packed selection here before
 * each visual frame.
 *
 * Exported as a named constant so PickRenderer's per-pass tweaks share one
 * source of truth with PointRenderer's full-uniform pack.
 */
export const SELECTED_PACKED_BYTE_OFFSET = 80;

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.
 *
 * The struct contains (offsets are byte offsets from the start of the buffer):
 *
 *   bytes  0..63  : cam.viewProj      mat4x4<f32>  (16 floats = 64 bytes)  } CameraUniforms
 *   bytes 64..71  : cam.viewportPx    vec2<f32>    (2 floats)              } prefix from
 *   bytes 72..75  : cam._pad0         f32          (alignment slack)       } lib/camera.wesl
 *   bytes 76..79  : cam._pad1         f32          (alignment slack)       } (80 B total)
 *   bytes 80..83  : selectedPacked    u32                             ← (selectedSource << 27) | selectedLocalIdx, or 0xFFFFFFFF
 *   bytes 84..87  : sourceCode        u32                             ← per-draw source tag (5 bits used)
 *   bytes 88..91  : pointSizePx       f32   (moved here from offset 72 — see Uniforms doc-block)
 *   bytes 92..95  : brightness        f32   (moved here from offset 76 — see Uniforms doc-block)
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
 *   bytes 160..163: pxFadeStart       f32   (Task 8 procedural-disk band low)  }
 *   bytes 164..167: pxFadeEnd         f32   (Task 8 procedural-disk band high) } 16 bytes
 *   bytes 168..171: _padFade0         f32          (written as 0)               }
 *   bytes 172..175: _padFade1         f32          (written as 0)               }
 *
 * Total: 176 bytes — a multiple of 16 ✓
 *
 * WGSL uniform buffers follow rules similar to std140 (see WGSL spec §13,
 * "Memory Layout"). Each member must be aligned to its alignment value:
 * `vec3<f32>` requires 16-byte alignment, which is why we still need 8
 * bytes between `sourceCode` (offset 84) and `camPosWorld` (offset 96).
 * The pre-CameraUniforms layout filled those 8 bytes with explicit
 * `_pad0/_pad1` u32s; the post-refactor layout fills them with
 * `pointSizePx` + `brightness` (formerly at offsets 72/76, which now
 * belong to `CameraUniforms._pad0/_pad1`). Same number of bytes, same
 * alignment — the displaced scalars simply moved into the existing pad slack.
 *
 * The picker (`pickRenderer.ts`) writes `selectedPacked` (offset 80,
 * UNCHANGED across the refactor) + `sourceCode` (offset 84) for every
 * per-source draw — see its `pick()` docblock for the per-source
 * uniform-write pattern that lets the pick pass see the same packed
 * identity space the visual pass does. It also writes `pointSizePx` at
 * offset 88 (moved from offset 72 by the CameraUniforms refactor).
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
// Task 8 of the procedural-disk-impostor plan appended a 16-byte block
// for the points-pass crossfade-OUT thresholds (`pxFadeStart`,
// `pxFadeEnd`, plus two pads to round up to the next 16-byte boundary):
//
//   bytes 160..163: pxFadeStart  f32   (procedural-disk crossfade band low)
//   bytes 164..167: pxFadeEnd    f32   (procedural-disk crossfade band high)
//   bytes 168..171: _padFade0    f32   (alignment pad)
//   bytes 172..175: _padFade1    f32   (alignment pad)
//
// Total: 176 bytes — still a multiple of 16 ✓.  See the WGSL Uniforms
// struct in `points.wgsl` for the rationale (single source of truth
// for the fade band, alpha=0 instead of clip-space cull).
const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 4 * 4 + 8 * 4 + 4 * 4; // 176 bytes

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
function defaultSchechterWorkerRunner(input: ComputeSchechterRatiosInput): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const worker = new ComputeSchechterRatiosWorker();
    worker.onmessage = (event: MessageEvent<Float32Array>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message ?? 'schechter-ratio worker error'));
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
      reject(event.error ?? new Error(event.message ?? 'angular-weights worker error'));
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
 * The previous revision tracked `instanceIdOffset` + `bakedPriorCount` here
 * to manage the cross-source globally-unique running-sum identity space.
 * Both fields are gone: the picker now writes
 * `(sourceCode << 27) | localIdx + 1` from a per-draw uniform, so each
 * survey's identity range is structurally disjoint by construction and
 * no per-vertex baking (or post-upload rebake bookkeeping) is needed.
 */
type LoadedSource = {
  buffer: GPUBuffer;
  count: number;
  /**
   * Mirror of the interleaved Float32Array baked into `buffer` at upload
   * time.  Held on the JS side so `bakeSchechterRatios()` can splice
   * fresh Schechter ratios into slot 10 of every row and re-upload the
   * whole buffer with one `device.queue.writeBuffer` call — see that
   * method's doc for why this is faster than N sparse writes.
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
   * `null` until the first `setBiasMode(BiasMode.Schechter)` call
   * resolves for this source.  Callers must check before using.
   */
  cachedSchechterRatios: Float32Array | null;
  /**
   * Cached per-galaxy HEALPix angular re-weights, populated lazily the
   * first time the user selects `BiasMode.AngularReweight` (mode 4).
   * Mirrors `cachedSchechterRatios` exactly.
   *
   * `null` until the first `setBiasMode(BiasMode.AngularReweight)` call
   * resolves for this source.  Callers must check before using.
   */
  cachedAngularWeights: Float32Array | null;
  /**
   * Reference to the original cloud passed to `upload()`.  Held so the
   * lazy-bake paths (Schechter / angular reweight) can re-traverse the
   * source data without a round-trip to the engine's cloud map.  Same
   * object the engine already holds in its `clouds` map — no
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
  /**
   * Per-cloud fade-in controller.  Owns its own 16-byte uniform buffer +
   * bind group at `@group(1) @binding(0)`, plus the fade-start timestamp.
   * Reset (`fade.restart()`) on every upload so tier-swap re-uploads
   * trigger a fresh fade-in.  Written via `fade.writeFrame()` and bound
   * via `pass.setBindGroup(1, fade.bindGroup)` from the render loop.
   * See `cloudFade.ts` for the full design.
   */
  fade: CloudFade;
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
   * `unload` removes one.  No global running-sum bookkeeping anymore — each
   * source's pick identity comes from its CloudFade's per-source sourceCode
   * uniform, set once at upload.
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
   *   2. `setBiasMode()` is the canonical writer for this flag (it
   *      becomes a write-only consequence of the engine's mode change).
   *      `clearSchechterRatios()` also resets it as a side-effect of
   *      wiping the GPU buffer back to 1.0 — see that method for the
   *      rationale.
   *
   * Default `false`: a fresh renderer assumes the default bias mode (None),
   * matching `engine.ts`'s initial `let biasMode: BiasMode = BiasMode.None`.
   */
  private schechterModeActive = false;

  /**
   * Whether the engine has currently selected `BiasMode.AngularReweight`.
   * Mirrors `schechterModeActive` exactly — written by `setBiasMode()`
   * (the canonical writer) and `clearAngularWeights()` (side-effect of
   * the explicit reset) so a new upload arriving while mode 4 is active
   * can know to bake the weights eagerly (currently we don't — see
   * `buildPointInterleavedBuffer.ts`'s slot-12 comment — but the flag is
   * here for symmetry and so the same triggering pattern stays familiar
   * across modes).
   */
  private angularReweightModeActive = false;

  /**
   * Static factory for the lazy Schechter-ratio worker.  Production path
   * spawns a Vite `?worker` chunk; Node tests can override with a
   * synchronous in-process runner via
   * `PointRenderer.setSchechterRatioRunner(...)`.  Same pattern as
   * `setBuildBufferRunner` for the main bake.
   */
  private static schechterRunner: (input: ComputeSchechterRatiosInput) => Promise<Float32Array> =
    defaultSchechterWorkerRunner;

  /**
   * Override the Schechter-ratio runner — used by tests that can't load the
   * Vite `?worker` import.  Pass a synchronous function that runs the pure
   * `computeSchechterRatios` directly, or `null` to restore the default.
   */
  static setSchechterRatioRunner(
    runner: ((input: ComputeSchechterRatiosInput) => Promise<Float32Array>) | null,
  ): void {
    PointRenderer.schechterRunner = runner ?? defaultSchechterWorkerRunner;
  }

  /**
   * Static factory for the lazy HEALPix angular-reweight worker.  Production
   * path spawns a Vite `?worker` chunk; Node tests can override with a
   * synchronous in-process runner via `setAngularWeightRunner(...)`.  Same
   * pattern as `setSchechterRatioRunner`.
   */
  private static angularRunner: (input: ComputeAngularWeightsInput) => Promise<Float32Array> =
    defaultAngularWeightsWorkerRunner;

  /**
   * Override the angular-reweight runner — used by tests that can't load
   * the Vite `?worker` import.  Pass a synchronous function that runs the
   * pure `computeAngularWeights` directly, or `null` to restore the default.
   */
  static setAngularWeightRunner(
    runner: ((input: ComputeAngularWeightsInput) => Promise<Float32Array>) | null,
  ): void {
    PointRenderer.angularRunner = runner ?? defaultAngularWeightsWorkerRunner;
  }

  // ─── Public accessors ────────────────────────────────────────────────────────

  /**
   * @internal
   *
   * Read by `createPickRenderer` — the pick pass shares this uniform buffer
   * with the visual pass so it sees the same view-projection matrix the
   * visual frame just wrote.  Engine code MUST NOT consume this; the
   * coupling is bound at PickRenderer construction time and threaded
   * internally.
   *
   * Kept as a public getter for the ESM module-graph reach — TypeScript
   * does not enforce `@internal` at compile time without
   * `--stripInternal` configured, but the documented contract + a grep
   * at PR review time prevents engine consumers from re-introducing
   * the leak.
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
    // Two modules — one per stage — built from disjoint sources. The
    // vertex source is shared (textually) with PickRenderer, but each
    // renderer compiles its OWN GPUShaderModule from it; sharing modules
    // across pipelines tempts you into the WebGPU 'auto' bind-group-layout
    // trap (auto-derived layouts are pipeline-specific identities and
    // sharing them across pipelines fails the 'group-equivalent'
    // compatibility check at draw time).
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'points.vertex');
    const fsModule = createShaderModuleWithDevLog(device, colorFsCode, 'points.colorFragment');

    this.pipeline = device.createRenderPipeline({
      label: 'points-pipeline',
      layout: 'auto',

      vertex: {
        module: vsModule,
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
              // kPerZ (f32) — offset 20 bytes.  Per-row K-correction
              // coefficient (see colourIndex.ts).
              { shaderLocation: 3, offset: K_PER_Z_BYTE_OFFSET, format: 'float32' },
              // axisRatio (f32) — offset 24 bytes.  Galaxy disk b/a in
              // (0, 1] with the SIGN BIT carrying the fallback flag —
              // the shader recovers the mask shape via `abs(axisRatio)`
              // and the flag via `axisRatio < 0.0`.
              { shaderLocation: 4, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
              // positionAngleDeg (f32) — offset 28 bytes.  East-of-north
              // position angle of the major axis in degrees, [0, 180).
              { shaderLocation: 5, offset: POSITION_ANGLE_BYTE_OFFSET, format: 'float32' },
              // diameterKpc (f32) — offset 32 bytes.  Per-galaxy physical
              // diameter in kiloparsecs.  Vertex shader uses it to size
              // the billboard's apparent radius.
              { shaderLocation: 6, offset: DIAMETER_KPC_BYTE_OFFSET, format: 'float32' },
              // vMaxWeight (f32) — offset 36 bytes.  Per-galaxy 1/V_max
              // alpha multiplier; gated on `u.biasMode == 2u` via
              // `select(1.0, vMaxWeight, …)`.
              { shaderLocation: 7, offset: VMAX_WEIGHT_BYTE_OFFSET, format: 'float32' },
              // schechterRatio (f32) — offset 40 bytes.  Per-galaxy
              // Schechter density-correction ratio; gated on
              // `u.biasMode == 3u`.
              { shaderLocation: 8, offset: SCHECHTER_RATIO_BYTE_OFFSET, format: 'float32' },
              // angularDensityWeight (f32) — offset 44 bytes.  Per-galaxy
              // HEALPix angular re-weight; gated on `u.biasMode == 4u`.
              { shaderLocation: 9, offset: ANGULAR_WEIGHT_BYTE_OFFSET, format: 'float32' },
            ],
          },
        ],
      },

      fragment: {
        module: fsModule,
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
      label: 'points-uniform-buffer',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      label: 'points-bg-uniforms',
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
   * The upload now: spawns a fresh worker, ships the cloud + source via
   * structured clone, awaits the result, then writes the returned
   * `interleaved` buffer to GPU memory and updates bookkeeping.  The
   * worker's transferred ArrayBuffer becomes invalid on the worker
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
  /**
   * Replace (or clear) one source's GPU vertex buffer with the bytes baked
   * from `cloud`.  See the class-level docstring for the worker-vs-inline
   * choice; production runs the bake in a fresh `?worker` chunk per call.
   *
   * ### Race-condition behaviour
   *
   * If `upload(source, cloudA)` is in flight (worker baking) and a second
   * `upload(source, cloudB)` fires for the same source, both spawn their
   * own workers.  Whichever completes LAST wins — its `clouds.set` call
   * overwrites the first's entry, and the loser's GPU buffer (already
   * allocated by then) is leaked until the next upload destroys it.  The
   * older "running-sum globalInstanceIdx" scheme had a much nastier
   * variant where parallel uploads of *different* sources could leave
   * one source's identity baked against a stale priorCount; that whole
   * machinery is gone with this refactor — there's no global running
   * sum anymore, so cross-source races can't exist.
   */
  async upload(source: Source, cloud: PointCloud): Promise<void> {
    // ── Empty-cloud unload path ─────────────────────────────────────────────
    //
    // `engine.setTier` reuses this method to clear a source when the new
    // tier excludes it (small tier drops SDSS).  `cloudLoader.reloadSource`
    // signals "clear this source" by firing onResult with a count=0 cloud.
    //
    // The naive replace path below would call `device.createBuffer({ size: 0,
    // ... })` which the WebGPU spec forbids.  Short-circuit BEFORE the
    // bake/createBuffer step: destroy any prior buffer (frees VRAM) and
    // remove the entry from the Map entirely so the draw loop's
    // `if (!entry) continue;` naturally skips this source.
    if (cloud.count === 0) {
      const stale = this.clouds.get(source);
      if (stale) {
        stale.buffer.destroy();
        stale.fade.destroy();
      }
      this.clouds.delete(source);
      return;
    }

    // ── Run the bake off-thread ─────────────────────────────────────────────
    //
    // `runBuild` either spawns a fresh Web Worker (production path) or runs
    // the pure function inline (Node test path — see the static factory
    // override).  Each upload uses its own worker instance: parallel surveys
    // can bake simultaneously, and there's no shared-state cleanup between
    // calls.
    //
    // Mode = 'fast' unless Schechter is currently the active bias mode.  We
    // never want to do the per-galaxy integral at upload unless the user
    // is actively viewing mode 3, since the shader's `select(1.0, …, mode==3)`
    // gate makes the slot irrelevant in modes 0/1/2.
    const mode: BuildPointInterleavedBufferMode = this.schechterModeActive
      ? 'with-schechter'
      : 'fast';
    const result = await PointRenderer.runBuild({
      cloud,
      source,
      mode,
    });
    const { interleaved, schechter, mLim, nRef } = result;

    // ── Write to GPU ────────────────────────────────────────────────────────
    //
    // Destroy or restart the previous-source state before replacing it (GPU
    // buffers can't be realloc'd; allocating a fresh one of the new size and
    // letting the old one's VRAM go is the only path).  The fade controller
    // is recycled on a re-upload — its `restart()` resets the timestamp so
    // a tier swap re-triggers the fade-in.
    const prev = this.clouds.get(source);
    if (prev) {
      prev.buffer.destroy();
      prev.fade.restart();
    }

    const buffer = this.device.createBuffer({
      label: `points-vertex-buffer-${source}`,
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, interleaved);

    // Reuse the previous fade controller if this is a re-upload; otherwise
    // mint a fresh one.  Either way, the fadeStartMs is "now" so the next
    // few frames render at low opacity and ramp up.
    const fade = prev?.fade ?? new CloudFade(this.device, this.pipeline.getBindGroupLayout(1));
    // Stamp the per-source 5-bit Source enum value into the cloud's
    // bind group.  The shader's vertex stage reads `cloud.sourceCode`
    // and composes each instance's packed identity from it; doing this
    // once at upload (rather than per-frame in `draw()`) is correct
    // because the source code never changes for a given cloud — only
    // the opacity does.
    fade.setSourceCode(source);

    // If the upload was 'with-schechter', extract the per-row ratios from
    // slot 10 of the freshly-baked interleaved array and cache them — this
    // way a subsequent toggle Schechter→other→Schechter doesn't need to
    // re-spawn the worker.
    let cachedSchechterRatios: Float32Array | null = null;
    if (mode === 'with-schechter') {
      cachedSchechterRatios = new Float32Array(cloud.count);
      for (let i = 0; i < cloud.count; i++) {
        cachedSchechterRatios[i] = interleaved[i * SLOTS_PER_POINT + 10]!;
      }
    }

    this.clouds.set(source, {
      buffer,
      count: cloud.count,
      cloud,
      schechter,
      mLim,
      nRef,
      interleaved,
      cachedSchechterRatios,
      // Angular weights are never eagerly baked (see slot-11 comment in
      // buildPointInterleavedBuffer.ts); the upload always writes 1.0 and
      // the cache stays empty until `setBiasMode(BiasMode.AngularReweight)`
      // runs.
      cachedAngularWeights: null,
      fade,
    });
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

  /** Convenience wrapper used by `upload()`. */
  private static runBuild(
    input: BuildPointInterleavedBufferInput,
  ): Promise<BuildPointInterleavedBufferResult> {
    return PointRenderer.buildRunner(input);
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
    entry.fade.destroy();
    this.clouds.delete(source);
  }

  // ─── Bias-mode dispatch (Phase 5: collapsed public surface) ─────────────────

  /**
   * Set the active bias mode and run any per-mode bake.
   *
   * The renderer holds two private flags (`schechterModeActive`,
   * `angularReweightModeActive`) so a new `upload()` arriving while
   * one of those modes is active can bake the new cloud eagerly.
   * This method is the *only* way those flags should be set —
   * collapsing to one source of truth (the engine's `state.bias.mode`,
   * forwarded here).
   *
   * Behaviour by mode:
   *   - `Schechter` and `AngularReweight` trigger a per-source bake of
   *     the corresponding per-galaxy weights.  Cache hits skip the
   *     worker; cache misses spawn one worker per loaded source.
   *   - All other modes (None, VolumeLimited, ApparentMagLimited) are
   *     uniform-only: the shader's `select(1.0, weight, mode==N)` gate
   *     ignores the per-galaxy slot, so no bake is needed.
   *   - Re-toggle to the same mode is a no-op (the flag is already
   *     set; cached values are already in the GPU buffer).
   *
   * Fire-and-forget from the engine side: callers may `.then()` on
   * the returned promise to know when the bake settles, but the
   * per-frame draw loop continues drawing 1.0-default weights until
   * the mirror+writeBuffer round trip lands.  Errors propagate
   * through the returned promise's rejection.
   *
   * ### Why we keep the bake helpers private
   *
   * Pre-Phase-5 the engine called `applySchechterMode()` and
   * `applyAngularReweightMode()` directly, then independently mutated
   * `state.bias.mode` and the renderer's two `*ModeActive` flags.
   * That duplicated source-of-truth caused subtle ordering bugs (a
   * caller could forget to set the flag, or set it before the bake
   * resolved).  Funnelling everything through `setBiasMode` here means
   * the engine touches `state.bias.mode` and forwards once; the
   * renderer's flags become a write-only consequence of this call.
   */
  async setBiasMode(mode: BiasMode): Promise<void> {
    const wasSchechter = this.schechterModeActive;
    const wasAngular = this.angularReweightModeActive;
    const isSchechter = mode === BiasMode.Schechter;
    const isAngular = mode === BiasMode.AngularReweight;

    this.schechterModeActive = isSchechter;
    this.angularReweightModeActive = isAngular;

    if (!wasSchechter && isSchechter) {
      await this.bakeSchechterRatios();
      return;
    }
    if (!wasAngular && isAngular) {
      await this.bakeAngularWeights();
      return;
    }
    // Other transitions: no bake needed.  Going AWAY from a baked
    // mode leaves the per-galaxy slot values in the GPU buffer; the
    // shader's gate already ignores them in modes 0/1/2/3, so the
    // residual values are correct and cheap.
  }

  // ─── Splice surface (Spec E phase E.1) ────────────────────────────────────
  //
  // Three layout-aware methods that write per-galaxy bias-correction values
  // straight into the interleaved CPU mirror and re-upload the GPU buffer.
  // The bias-correction subsystem (Spec E phase E.3) calls into these once
  // its async worker bakes resolve.  They contain *no* state — no mode
  // flags, no caches, no async, no worker spawn.  The subsystem owns all
  // of that; this surface just lays down what it's told.
  //
  // The methods are no-ops for unloaded sources because the subsystem's
  // per-source bakes can race against `unload()` — by the time a bake
  // resolves, the source may have been removed.  Throwing here would
  // force every caller to re-check `clouds.has(source)` after an await,
  // duplicating the safety net.  Returning silently is the correct
  // semantics: "splice into nothing → nothing happens".
  //
  // Length-mismatch IS a programmer error — not a race — and we throw with
  // a readable message so the test layer catches it before it ships.
  //
  // E.1 is purely additive: no caller invokes these methods in this phase
  // — they exist for E.3 to wire into the subsystem's bake-resolve paths.
  // The existing `setBiasMode` / `bake*` / `clear*` paths continue to
  // work via the private `splice*IntoMirror` helpers; E.4 deletes those
  // and leaves the new public methods standing alone.

  /**
   * Splice a tightly-packed Float32Array of per-row Schechter ratios
   * (length must equal the source's `count`) into slot 10 of every row of
   * the entry's interleaved mirror, then re-upload the whole vertex
   * buffer.  No mode tracking; the caller (subsystem) decides when to
   * call this.
   */
  spliceSchechterRatios(source: Source, ratios: Float32Array): void {
    const entry = this.clouds.get(source);
    if (!entry) return;
    if (ratios.length !== entry.count) {
      throw new Error(
        `spliceSchechterRatios: length mismatch — got ${ratios.length} ratios, expected ${entry.count}`,
      );
    }
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 10] = ratios[i]!;
    }
    this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
  }

  /**
   * Splice a tightly-packed Float32Array of per-row HEALPix angular
   * weights (length must equal the source's `count`) into slot 11 of
   * every row of the entry's interleaved mirror, then re-upload.
   */
  spliceAngularWeights(source: Source, weights: Float32Array): void {
    const entry = this.clouds.get(source);
    if (!entry) return;
    if (weights.length !== entry.count) {
      throw new Error(
        `spliceAngularWeights: length mismatch — got ${weights.length} weights, expected ${entry.count}`,
      );
    }
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 11] = weights[i]!;
    }
    this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
  }

  /**
   * Zero slots 10 (Schechter ratio) AND 11 (angular weight) for either
   * one named source or every loaded source.
   *
   * Why zero rather than 1.0?  The shader's `select(1.0, slot, mode==N)`
   * gate already substitutes 1.0 (the multiplicative identity) when the
   * mode doesn't match — so the slot's literal value is irrelevant in
   * inactive modes.  Zero is the cheapest "obviously-cleared" sentinel a
   * future debug overlay or diagnostic can recognise without ambiguity.
   * The pre-Spec-E `clear*` helpers wrote 1.0 for symmetry with the
   * shader's identity; the new method writes 0.0 because the subsystem
   * is the only caller and it explicitly transitions to None /
   * VolumeLimited after a clear (where the slot is dead anyway).
   */
  clearBiasOverlays(source?: Source): void {
    const targets: LoadedSource[] =
      source !== undefined
        ? (() => {
            const entry = this.clouds.get(source);
            return entry ? [entry] : [];
          })()
        : Array.from(this.clouds.values());
    for (const entry of targets) {
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 10] = 0;
        entry.interleaved[i * SLOTS_PER_POINT + 11] = 0;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  // ─── Lazy Schechter-ratio bake ──────────────────────────────────────────────

  /**
   * Compute and upload per-galaxy Schechter ratios for every loaded source.
   *
   * Invoked by `setBiasMode` on the first transition TO `BiasMode.Schechter`.
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
   * ### Why this is a private helper
   *
   * Phase 5 collapsed the public surface to `setBiasMode(mode)` (see the
   * docstring there).  The flag mutation now lives in `setBiasMode`; this
   * helper does only the bake work.  Calling it from anywhere else would
   * skip the flag check and break the eager-on-upload contract.
   */
  private async bakeSchechterRatios(): Promise<void> {
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
   *
   * Note that this method also clears `schechterModeActive`, in contrast
   * to `setBiasMode` which is the canonical writer for that flag.  We
   * keep the side-effect here because anyone calling `clearSchechterRatios`
   * is by definition trying to undo the bake — leaving the flag set
   * would lie about the renderer's state.
   */
  clearSchechterRatios(): void {
    this.schechterModeActive = false;
    for (const entry of this.clouds.values()) {
      // Splice all-1.0 into slot 10 of the mirror, re-upload.  We don't
      // build a separate "ones" Float32Array — a simple loop is fine
      // since this is invoked at most a few times per session.
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 10] = 1.0;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  /**
   * Splice a tightly-packed Float32Array of per-row ratios (length =
   * entry.count) into slot 10 of every row of the entry's interleaved
   * mirror.  Pure function over the mirror buffer — no GPU calls.
   *
   * Extracted as a private helper so `bakeSchechterRatios` (cache-hit
   * and worker-resolve paths) can share the same loop without duplicating
   * the stride math.  The caller is responsible for the subsequent
   * `writeBuffer` upload to the GPU.
   */
  private spliceSchechterIntoMirror(entry: LoadedSource, ratios: Float32Array): void {
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 10] = ratios[i]!;
    }
  }

  // ─── Lazy HEALPix angular re-weight bake ────────────────────────────────────

  /**
   * Compute and upload per-galaxy HEALPix angular re-weights for every
   * loaded source.  Mirrors `bakeSchechterRatios()` exactly — same lazy
   * pattern, same per-source caching, same single-buffer-rewrite upload.
   *
   * Invoked by `setBiasMode` on the first transition TO
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
  private async bakeAngularWeights(): Promise<void> {
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
        entry.interleaved[i * SLOTS_PER_POINT + 11] = 1.0;
      }
      this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  /**
   * Splice a tightly-packed Float32Array of per-row angular weights
   * (length = entry.count) into slot 11 of every row of the entry's
   * interleaved mirror.  Mirror of `spliceSchechterIntoMirror`.
   */
  private spliceAngularIntoMirror(entry: LoadedSource, weights: Float32Array): void {
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 11] = weights[i]!;
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
   * Look up the per-source point count, or 0 when the source isn't
   * loaded.  Used by the engine to bounds-check a (source, localIdx)
   * pair before calling `setSelected` or building a PointInfo.
   *
   * Replaces the prior `fromGlobalIdx` decoder: the picker now hands
   * back a structured `{source, localIdx}` directly, so no decoding is
   * needed — but callers still want to ask "is this localIdx within
   * the freshly-uploaded cloud?" because tier swaps can shrink a
   * source's count in flight.  This getter is the smallest possible
   * answer.
   */
  countOf(source: Source): number {
    return this.clouds.get(source)?.count ?? 0;
  }

  /**
   * Iterate over every loaded source's GPU buffer in `Source` enum order.
   * Used by the picker to issue its own per-source draw calls.
   *
   * The iterable is generated fresh on each call so the caller may call
   * `unload()` between iterations without affecting the snapshot — but
   * they must not assume the iteration order beyond "stable for this
   * call".
   */
  *loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    /**
     * Underlying CloudFade `GPUBuffer` for this source (containing
     * opacity + 5-bit `sourceCode`).  PickRenderer builds its OWN
     * per-source `@group(1)` bind group around this buffer using its
     * own pipeline's auto-derived layout.
     *
     * Why expose the buffer rather than the bind group?  WebGPU's
     * `layout: 'auto'` produces a UNIQUE bind-group layout per
     * pipeline.  Sharing one bind group across two auto-layout
     * pipelines fails the "group-equivalent" compatibility check at
     * draw time ("BindGroupLayout was not created by the pipeline").
     * Each pipeline must build its own bind groups against its own
     * `getBindGroupLayout(1)`.  The underlying buffer is shared
     * fine — it's just the layout objects that differ.
     *
     * The visual `draw()` calls `fade.writeFrame()` once per frame,
     * so by the time the pick pass runs (always after the visual
     * frame for that mouse event) the buffer is up to date.  No
     * extra writes from the picker.
     */
    cloudFadeBuffer: GPUBuffer;
  }> {
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      yield {
        source,
        vertexBuffer: entry.buffer,
        count: entry.count,
        cloudFadeBuffer: entry.fade.buffer,
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
   * @param selectedPacked     Selected galaxy as `(source << 27) | localIdx`,
   *                           or `0xFFFFFFFF` for "no selection".
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
    selectedPacked: number,
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
    /**
     * Procedural-disk crossfade-OUT thresholds (Task 8 of the
     * procedural-disk-impostor plan).  The points-pass fragment shader
     * fades alpha to zero across the apparent-pixel-size band
     * `[pxFadeStart, pxFadeEnd]` so the procedural-disk pass — which
     * fades IN over the same band — can take over without a "double-
     * bright donut" of overlapping passes.  Both ends are pixel
     * thresholds in the same units as the vertex stage's `sizePx`
     * (the apparent angular radius of the galaxy projected to screen).
     *
     * The engine should pass `PROCEDURAL_DISK_FADE_START_PX` and
     * `PROCEDURAL_DISK_FADE_END_PX` from `./engine/thumbnailSubsystem`
     * so both passes share a single source of truth — drift between
     * them would re-introduce the double-bright donut on one side and
     * a hard gap on the other.
     */
    pxFadeStart: number,
    pxFadeEnd: number,
  ): void {
    // Nothing to draw if no source has been uploaded yet.
    if (this.clouds.size === 0) return;

    // ── Pack and upload the uniform buffer ──────────────────────────────────
    //
    // The new tail fields (`camPosWorld` and `pxPerRad`) feed apparent-size
    // billboard sizing in the vertex shader. See the `UNIFORM_BYTES` doc
    // above for the exact byte layout — note the eight-byte gap between
    // `selectedPacked` (offset 80) and `camPosWorld` (offset 96) required
    // by vec3 alignment.
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    // Cam block (offsets 0..79) — viewProj + viewportPx + 2 reserved pads.
    // f32[18] / f32[19] are the CameraUniforms '_pad0' / '_pad1' slots; the
    // shared struct reserves them for vec3-alignment and they stay zero here.
    f32.set(viewProj, 0);
    f32[16] = viewportPx[0]; // cam.viewportPx.x at byte offset 64
    f32[17] = viewportPx[1]; // cam.viewportPx.y at byte offset 68
    // f32[18], f32[19] (cam._pad0, cam._pad1) stay zero.
    u32[20] = selectedPacked >>> 0; // selectedPacked at byte offset 80
    // u32[21] (offset 84) is the @group(0) _pad0 — sourceCode lives in
    // the per-source @group(1) cloud bind group, not @group(0).
    // ArrayBuffer starts zero-initialised so we don't need to write it.
    // pointSizePx + brightness moved into f32[22]/f32[23] from f32[18]/f32[19]
    // when the shared CameraUniforms prefix took over the first 80 bytes —
    // they recycle the existing 8-byte alignment slack between the
    // @group(0)-unused slot at offset 84 and the vec3-aligned camPosWorld
    // at offset 96.  See the 'Uniforms layout' doc-block in points.wesl
    // and the matching POINT_SIZE_OFFSET = 88 in pickRenderer.ts.
    f32[22] = pointSizePx; // bytes 88..91
    f32[23] = brightness; // bytes 92..95
    f32[24] = camPosWorld[0]; // bytes 96..99
    f32[25] = camPosWorld[1]; // bytes 100..103
    f32[26] = camPosWorld[2]; // bytes 104..107
    f32[27] = pxPerRad; // bytes 108..111
    // Task 15 — orientation-visibility toggles.  Two u32 booleans + 2 u32
    // padding rounding the struct to 128 bytes.  See UNIFORM_BYTES doc above.
    u32[28] = highlightFallback ? 1 : 0; // bytes 112..115
    u32[29] = realOnlyMode ? 1 : 0; // bytes 116..119
    u32[30] = depthFadeEnabled ? 1 : 0; // bytes 120..123  depthFadeEnabled (formerly _pad3)
    // u32[31] (_pad4) stays zero.

    // Malmquist-bias correction state (Task 2 of the malmquist-bias plan).
    // Slots 32-39 cover bytes 128..159 — see UNIFORM_BYTES doc above for the
    // detailed offsets.  We write the integer mode through the u32 view and
    // the four f32 thresholds through the f32 view; both views point at the
    // same underlying ArrayBuffer so the writes don't collide.  `biasMode`
    // is masked with `>>> 0` to coerce the JS number to an unsigned 32-bit
    // value (defensive — `BiasMode` only has 0..3 but a future caller might
    // pass something via `setBiasMode`).
    u32[32] = biasMode >>> 0; // bytes 128..131  biasMode
    f32[33] = absMagLimit; // bytes 132..135  absMagLimit
    f32[34] = apparentMagLimit; // bytes 136..139  apparentMagLimit (Task 3)
    f32[35] = schechterMStar; // bytes 140..143  schechterMStar   (Task 4)
    f32[36] = schechterAlpha; // bytes 144..147  schechterAlpha   (Task 4)
    // u32[37..39] (_pad5/_pad6/_pad7) stay zero — they round the struct
    // out to a 16-byte boundary so a future vec3/vec4 append doesn't
    // silently break alignment.

    // ── Procedural-disk crossfade-OUT thresholds (Task 8) ───────────────────
    //
    // Slots 40 + 41 (byte offsets 160 + 164) carry the apparent-pixel-
    // size band the fragment shader fades alpha across.  Slots 42 + 43
    // are reserved pads — they round the appended block out to a
    // 16-byte boundary, matching the WGSL struct's `_padFade0/1` fields.
    // The pads stay zero (Float32Array starts zero-initialised; we
    // don't write them, so they're already 0.0).
    f32[40] = pxFadeStart; // bytes 160..163  pxFadeStart
    f32[41] = pxFadeEnd; // bytes 164..167  pxFadeEnd
    // f32[42] / f32[43] (_padFade0 / _padFade1) stay zero.

    this.device.queue.writeBuffer(this.uniformBuffer_internal, 0, buf);

    // ── Per-source draw loop ────────────────────────────────────────────────
    //
    // Bind the pipeline + global bind group once (these don't change between
    // draws) and then for each loaded source:
    //   1. Skip it if its visibility bit is not set in the mask.
    //   2. Bind the source's `entry.fade.bindGroup` (CloudFade) on @group(1)
    //      — carries this source's `opacity` AND its 5-bit `sourceCode`
    //      that the shader composes into each instance's packed identity.
    //   3. Set this source's vertex buffer and issue a 6-vertex × N-instance
    //      draw call.
    //
    // The CloudFade's per-source bind group is exactly what dodges the
    // queue.writeBuffer race: each source has its OWN uniform buffer, so
    // writing this source's sourceCode + opacity doesn't race against
    // writes to any other source's uniform between draws within one
    // submit.  See CLAUDE.md → "WebGPU `queue.writeBuffer` race" and the
    // `cloudFade.ts` "per-instance buffers" docblock for the full
    // rationale.
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);

    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;

      // Bitmask check: `(mask >> source) & 1`. Equivalent to maskHas() from
      // `data/sources.ts`, inlined here because this is the per-frame hot path.
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      entry.fade.writeFrame();
      pass.setBindGroup(1, entry.fade.bindGroup);
      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(6, entry.count);
    }
  }

  /**
   * Whether any loaded source is still ramping up its fade-in opacity.
   * The engine's render scheduler consults this on every frame tail —
   * while it returns true, `requestRender()` keeps firing so the smoothstep
   * keeps advancing.  Returns false once every cloud has saturated at
   * opacity 1.0, after which the loop can pause as usual.
   */
  isFading(): boolean {
    for (const entry of this.clouds.values()) {
      if (entry.fade.isFading()) return true;
    }
    return false;
  }
}
