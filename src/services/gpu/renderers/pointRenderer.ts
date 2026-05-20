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
 * packing: each source's `@group(2)` SourceUniforms bind group carries a
 * 5-bit `sourceCode` that the vertex stage composes with
 * `@builtin(instance_index)` into each fragment's packed identity, written
 * into the r32uint pick texture by `fsPick`.  No more cross-source
 * running-sum bake.
 *
 * ### Relationship to other modules
 *
 *   GalaxyCatalog  →  upload(source, …)    →  GPU vertex buffer per source
 *   OrbitCamera →  computeViewProj()    →  draw()  →  uniform buffer  (every frame)
 *
 * @module
 */

import { mat4 } from 'gl-matrix';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { PointDrawSettings } from '../../../@types/rendering/PointDrawSettings';
import type { PointRenderer } from '../../../@types/rendering/PointRenderer';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import { SURVEY_SOURCES, Source } from '../../../data/sources';
import type { BuildPointInterleavedBufferInput } from '../../../@types/engine/BuildPointInterleavedBufferInput';
import type { BuildPointInterleavedBufferResult } from '../../../@types/engine/BuildPointInterleavedBufferResult';
import type { SourceType } from '../../../@types/data/SourceType';

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
import { cloneGalaxyCatalogForTransfer } from '../../../data/galaxyCatalogTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';

// Spec E phase E.4 moved the lazy-Schechter and lazy-angular-reweight
// `?worker` imports out of this file.  They now live in
// `services/engine/subsystems/biasCorrectionSubsystem.ts` alongside the
// bake state machine — uni-directional split (the renderer doesn't
// observe the subsystem; the subsystem feeds the renderer through the
// public splice methods below).

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
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import type { FadeUniformsBgl } from '../../../@types/rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../../@types/rendering/SourceUniformsBgl';

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * Number of 4-byte slots packed per catalog point in the vertex buffer.
 *
 * Layout (matches the `PerVertex` struct in points.wgsl):
 *   [x f32, y f32, z f32,
 *    magnitude f32, colorIndex f32,
 *    kPerZ f32,
 *    axisRatio f32 (sign bit = isFallback flag),
 *    positionAngleDeg f32, radiusMpc f32,
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
const SLOTS_PER_POINT = 11;

/**
 * Byte stride between consecutive per-instance records in the vertex buffer.
 *
 * 11 slots × 4 bytes = 44 bytes. The pipeline's `arrayStride` must match
 * this exactly; if it disagrees WebGPU will either validate-error or
 * silently read garbage.  PickRenderer's pipeline declares the same
 * 44-byte stride and the same attribute table, so the two pipelines stay
 * compatible with this single vertex buffer layout.
 */
export const POINT_STRIDE = SLOTS_PER_POINT * 4; // 44 bytes

/**
 * Byte offset of the `axisRatio` slot — the b/a ratio of the galaxy disk.
 *
 * Sits at slot index 5 (offset 20).  The fragment shader uses
 * `abs(axisRatio)` to squash the unit-circle UV mask into an ellipse;
 * the sign bit doubles as the fallback-orientation flag (real
 * measurements are positive; a negative value flags a fallback row).
 */
const AXIS_RATIO_BYTE_OFFSET = 20;

/**
 * Byte offset of the `positionAngleDeg` slot — the east-of-north position
 * angle of the galaxy disk's major axis, in degrees [0, 180).
 *
 * Sits at slot index 6 (offset 24).  The fragment shader rotates the
 * squashed ellipse around the billboard centre by this angle.
 */
const POSITION_ANGLE_BYTE_OFFSET = 24;

/**
 * Byte offset of the `radiusMpc` slot — the per-galaxy padded billboard
 * radius in Mpc.
 *
 * Sits at slot index 7 (offset 28).  Pre-baked at upload time as
 * `max(diameterKpc, 30) * 2 / 1000`, which folds in the 4×
 * thumbnail-footprint padding and the synthetic-fallback floor.  The
 * vertex shader divides directly by distance_Mpc to get angular radius.
 */
const RADIUS_MPC_BYTE_OFFSET = 28;

/**
 * Byte offset of the `vMaxWeight` slot — the per-galaxy 1/V_max alpha
 * multiplier used by the Malmquist-bias correction's mode 2.
 *
 * Sits at slot index 8 (offset 32).  Baked at upload time from each
 * galaxy's apparent magnitude, Cartesian distance and the survey's flux
 * limit.
 */
const VMAX_WEIGHT_BYTE_OFFSET = 32;

/**
 * Byte offset of the `schechterRatio` slot — the per-galaxy Schechter
 * density-correction ratio used by the Malmquist-bias correction's mode 3.
 *
 * Sits at slot index 9 (offset 36).  Default 1.0 in fast mode; real
 * ratios spliced in lazily when the user picks mode 3.
 */
const SCHECHTER_RATIO_BYTE_OFFSET = 36;

/**
 * Byte offset of the `angularDensityWeight` slot — the per-galaxy HEALPix
 * angular re-weight used by the Malmquist-bias correction's mode 4.
 *
 * Sits at slot index 10 (offset 40).  Default-baked to 1.0
 * (multiplicative identity) at upload time so modes 0/1/2/3 see no
 * change.  Real per-galaxy values are spliced in lazily by the
 * bias-correction subsystem (`biasCorrectionSubsystem.ts`) the first
 * time the user picks mode 4 in the SettingsPanel, mirroring the
 * lazy-Schechter pattern (see SCHECHTER_RATIO_BYTE_OFFSET above for
 * the same trade-off discussion).
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
 * the user toggles mode 4 ON, then loads a new survey, the
 * bias-correction subsystem's `onSourceUploaded` callback fires a
 * per-source bake for the new source and splices in real weights when
 * it resolves — same lazy semantics as Schechter.
 */
const ANGULAR_WEIGHT_BYTE_OFFSET = 40;

/**
 * Vertex buffer attribute table — single source of truth shared with
 * `PickRenderer`.
 *
 * Pre-cleanup, `PickRenderer` re-declared this table inline with magic
 * numbers (`0, 12, 16, 20, …, 44`) guarded only by a comment
 * (`// must exactly match PointRenderer's layout`).  A missed edit
 * silently failed at WebGPU draw-time pipeline validation, or worse,
 * read garbage attributes.  Exporting the array and importing it
 * verbatim into `PickRenderer` makes drift structurally impossible —
 * editing one offset propagates everywhere automatically.
 *
 * Slot semantics (see the per-offset JSDoc above for the full rationale):
 *
 *   0  position (vec3<f32>)
 *   1  magnitude (f32)
 *   2  colorIndex (f32)
 *   3  axisRatio (f32) — b/a; SIGN BIT = isFallback flag
 *   4  positionAngleDeg (f32) — east-of-north major-axis angle, [0, 180)
 *   5  radiusMpc (f32) — padded billboard half-extent in Mpc (pre-baked)
 *   6  vMaxWeight (f32) — Malmquist mode 2 (1/V_max) multiplier
 *   7  schechterRatio (f32) — Malmquist mode 3 (Schechter) ratio
 *   8  angularDensityWeight (f32) — Malmquist mode 4 (HEALPix) re-weight
 *
 * The right-hand sides reference the named byte-offset constants above
 * so the JSDoc on each constant stays the canonical documentation for
 * its slot.  Position / magnitude / colorIndex use literal offsets
 * (0 / 12 / 16) because they're never read by name elsewhere — only
 * the offsets that the bake or shader-side code needs to address by
 * name get named constants.  kPerZ was previously slot 3; it now lives
 * in the per-survey SourceUniforms uniform (set once at upload time).
 */
export const POINT_VERTEX_ATTRIBUTES: readonly GPUVertexAttribute[] = [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32' },
  { shaderLocation: 2, offset: 16, format: 'float32' },
  { shaderLocation: 3, offset: AXIS_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 4, offset: POSITION_ANGLE_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 5, offset: RADIUS_MPC_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 6, offset: VMAX_WEIGHT_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 7, offset: SCHECHTER_RATIO_BYTE_OFFSET, format: 'float32' },
  { shaderLocation: 8, offset: ANGULAR_WEIGHT_BYTE_OFFSET, format: 'float32' },
];

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
 * `BuildPointBufferWorker`, ships a *copied* `GalaxyCatalog` via `postMessage`'s
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
 * `onCatalogReady` from firing — the status bar showed only "75 points"
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
 * Alternative considered (and rejected for now): split `GalaxyCatalog`
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
  const { copy, transfer } = cloneGalaxyCatalogForTransfer(input.cloud);
  return runDisposableWorker<BuildPointInterleavedBufferInput, BuildPointInterleavedBufferResult>(
    BuildPointBufferWorker,
    { ...input, cloud: copy },
    transfer,
    'point-bake',
  );
}

// ─── Build-runner injection (module-level — Spec E phase E.4) ────────────────
//
// The off-thread vertex-buffer bake's runner is a module-level binding,
// not a class static.  Tests that can't load the Vite `?worker` import
// (Vitest runs in Node, where `Worker` doesn't exist) override it via
// `setBuildBufferRunner(...)` to point at a synchronous in-process
// implementation.
//
// ### Why the bias-correction runners moved to a subsystem but this one stayed
//
// `buildRunner` builds the *initial* `interleaved` Float32Array at
// upload time from a `GalaxyCatalog`'s struct-of-arrays.  That's
// constitutive of "construct a renderable vertex buffer from a parsed
// catalog" — the renderer's own job.  The `with-schechter` flag the
// pre-Spec-E version of `upload()` used to pass through is gone; after
// E.4 the renderer always uploads in 'fast' mode (no inline Schechter
// integral), and the bias-correction subsystem fires a per-source
// Schechter bake via the `onSourceUploaded` callback if a bias mode is
// active when the source lands.  The bias-correction worker runners
// (`schechterRunner` / `angularRunner`) live on the subsystem because
// they belong to the bias state machine, not the rendering concern.
// Spec section *Worker injection* and Risk R4 cover the rationale.
//
// ### Why module-level rather than a class static
//
// Class statics are reachable as `PointRenderer.setBuildBufferRunner(...)`
// — a slightly heavier shape than the bare function call.  More
// importantly, statics tempt callers to treat the renderer as a global
// registry; module-level bindings are visibly module-scoped (you have
// to `import { setBuildBufferRunner }` from this file) and won't drift
// onto any future PointRenderer instance accidentally.
type BuildRunner = (
  input: BuildPointInterleavedBufferInput,
) => Promise<BuildPointInterleavedBufferResult>;

let buildRunner: BuildRunner = defaultWorkerRunner;

/**
 * Override the off-thread vertex-buffer bake runner.  Pass a synchronous
 * function that runs the pure `buildPointInterleavedBuffer` directly
 * (used by Vitest, which has no `Worker`), or `null` to restore the
 * worker-based default.
 *
 * The setter is module-level (not `PointRenderer.set...`) per Spec E
 * phase E.4 — see `BuildRunner`'s docblock above for the rationale on
 * why this stays at module scope while the bias-correction runners
 * (`schechterRunner` / `angularRunner`) moved to the subsystem.
 */
export function setBuildBufferRunner(runner: BuildRunner | null): void {
  buildRunner = runner ?? defaultWorkerRunner;
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
   * time.  Held on the JS side so the bias-correction subsystem's splice
   * methods (`spliceSchechterRatios` / `spliceAngularWeights` /
   * `clearBiasOverlays` below) can rewrite slot 9 / 10 of every row and
   * re-upload the whole buffer with one `device.queue.writeBuffer` call.
   *
   * Why a single full re-upload rather than N sparse writes?  WebGPU has
   * no scatter-write primitive.  We could issue one `writeBuffer` per
   * galaxy (3.5 M calls at 4 bytes) but that's measurably slower than a
   * single full-buffer write — every `writeBuffer` carries syscall
   * overhead.  Cost: ~50 ms PCIe transfer for 17 MB SDSS — imperceptible
   * against the user's "I picked Schechter mode" click latency budget.
   *
   * Memory cost: ~14 MB per fully-loaded SDSS deck.  Dwarfed by the
   * cloud's own struct-of-arrays (~100 MB), so this isn't a budget
   * concern.  The mirror is freed when the source unloads.
   *
   * ### Spec E phase E.2 / E.4 — fields no longer carried here
   *
   * Pre-Spec-E this type also carried `cachedSchechterRatios`,
   * `cachedAngularWeights`, `cloud` (a back-ref), and three survey
   * constants (`schechter`, `mLim`, `nRef`).  Phase E.2 moved the
   * survey constants to `services/biasCorrection/surveyConstants.ts`;
   * phase E.4 moved the bake state machine + per-source caches to
   * `biasCorrectionSubsystem.ts`.  The renderer's `LoadedSource` is now
   * a clean rendering-only record: buffer + count + CPU mirror + fade
   * buffers.
   */
  interleaved: Float32Array;
  /**
   * 16-byte GPU buffer holding the per-source FadeUniforms struct
   * (opacity f32 + 12 bytes pad). Written once per frame in `draw`
   * from the registry-read opacity value.
   */
  fadeBuffer: GPUBuffer;
  /**
   * Bind group binding `fadeBuffer` at @group(1) @binding(0) using
   * the canonical `fadeBgl` layout (so the same bind group works for
   * both the visual and pick pipelines).
   */
  fadeBindGroup: GPUBindGroup;
  /**
   * 16-byte GPU buffer holding the per-source SourceUniforms struct
   * (sourceCode u32 + 12 bytes pad). Written ONCE at upload time
   * (sourceCode never changes for a given source) and read by both
   * the visual and pick pipelines.
   */
  sourceBuffer: GPUBuffer;
  /**
   * Bind group binding `sourceBuffer` at @group(2) @binding(0) using
   * the canonical `sourceBgl` layout.
   */
  sourceBindGroup: GPUBindGroup;
};

// ─── PointRenderer ────────────────────────────────────────────────────────────

/**
 * Build the render pipeline, allocate the uniform buffer, and create
 * the bind group.  Returns a `PointRenderer` whose public methods
 * match the pre-Spec-F.3 class form byte-for-byte.
 *
 * ### Factory shape (Spec F.3)
 *
 * Pre-Spec-F.3 this shipped as `class PointRenderer`.  The conversion
 * follows the same pattern as F.1's stateless drawers and F.2's
 * filamentRenderer, matching the already-factory `createPickRenderer`
 * and every Spec D subsystem extraction (`createSelectionSubsystem`,
 * `createTweenManager`, `createRenderScheduler`, …).  Private fields
 * become closure-captured `const`/`let`, private methods become
 * closure-scoped functions, and the public method surface is exposed
 * inline on the returned object.  PR #66's `destroy()` body ports
 * verbatim.
 *
 * @param device  The WebGPU logical device. Owned by the caller.
 * @param format  The swap-chain texture format (e.g. `'bgra8unorm'`).
 */
export function createPointRenderer(
  device: GPUDevice,
  format: GPUTextureFormat,
  fadeBgl: FadeUniformsBgl,
  sourceBgl: SourceUniformsBgl,
): PointRenderer {
  // ── Pipeline + uniform buffer + global bind group ─────────────────
  //
  // Built once in this prologue and held in closure scope.  The
  // identities never change — `pipeline`, `bindGroup`, and
  // `uniformBuffer` are `const` because nothing in the renderer's
  // lifetime reassigns them.  The mutability lives in the per-source
  // `clouds` Map and the two bias-correction callbacks below.
  // Two modules — one per stage — built from disjoint sources. The
  // vertex source is shared (textually) with PickRenderer, but each
  // renderer compiles its OWN GPUShaderModule from it; sharing modules
  // across pipelines tempts you into the WebGPU 'auto' bind-group-layout
  // trap (auto-derived layouts are pipeline-specific identities and
  // sharing them across pipelines fails the 'group-equivalent'
  // compatibility check at draw time).
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'points.vertex');
  const fsModule = createShaderModuleWithDevLog(device, colorFsCode, 'points.colorFragment');

  const pipelineLayout = device.createPipelineLayout({
    label: 'points-pipeline-layout',
    bindGroupLayouts: [
      // @group(0) — per-frame uniforms (viewProj, viewport, …). This is
      // a pipeline-specific layout since it carries the Uniforms struct
      // unique to the points pipeline.
      device.createBindGroupLayout({
        label: 'points-bgl-group0',
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      }),
      // @group(1) — FadeUniforms (canonical, shared with every fading renderer).
      fadeBgl,
      // @group(2) — SourceUniforms (canonical, shared with PickRenderer).
      sourceBgl,
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'points-pipeline',
    layout: pipelineLayout,

    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: POINT_STRIDE,
          stepMode: 'instance',
          // Spread the readonly shared table into a mutable array — the
          // `@webgpu/types` `GPUVertexBufferLayout.attributes` field is
          // typed `GPUVertexAttribute[]` (mutable), so a `readonly` const
          // can't be passed directly.  We deliberately keep the export
          // `readonly` (callers must not mutate the canonical table), and
          // pay the one-time spread at pipeline-construction time.
          attributes: [...POINT_VERTEX_ATTRIBUTES],
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

  const uniformBuffer = device.createBuffer({
    label: 'points-uniform-buffer',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    label: 'points-bg-uniforms',
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // Reusable scratch for the per-source per-frame fade writeBuffer call.
  // 16 bytes = opacity f32 + 12 bytes pad. The pad slots stay zero
  // (ArrayBuffer is zero-initialised; we never write them).
  const fadeScratchBuffer = new ArrayBuffer(16);
  const fadeScratchF32 = new Float32Array(fadeScratchBuffer);

  // ── Per-source bookkeeping ────────────────────────────────────────
  //
  // Closure-captured Map of loaded survey buffers, keyed by `Source`
  // (numeric enum).  `upload` adds or replaces an entry; `unload`
  // removes one.  No global running-sum bookkeeping anymore — each
  // source's pick identity comes from its per-source SourceUniforms
  // buffer, written once at upload time.
  //
  // Why a `Map` (not a plain object)? `Map` preserves insertion
  // order, has a straightforward `delete`/`has` API, and avoids the
  // prototype-chain ambiguity of indexing a numeric-keyed object
  // literal.
  const clouds = new Map<SourceType, LoadedSource>();

  // ── Bias-correction subsystem callbacks ───────────────────────────
  //
  // Optional callbacks fired at the tail of `upload` / `unload`.  The
  // bias-correction subsystem (Spec E phase E.3 + E.4) installs them
  // via `setBiasUploadCallback` / `setBiasUnloadCallback` so it can
  // fire a per-source bake when a new source arrives mid-mode (or
  // drop cached ratios/weights when a source goes away).  The
  // renderer doesn't reach into engine state to find the subsystem;
  // the subsystem reaches in and installs the callbacks.  Uni-
  // directional coupling — the renderer doesn't know what the
  // callbacks do.
  //
  // Closure-captured `let` because the setters reassign them.  Null
  // when no subsystem is attached (e.g. tests, or the brief pre-
  // attach window during bootstrap); `?.` invocation makes that a
  // no-op.
  let biasUploadCallback: ((source: SourceType, cloud: GalaxyCatalog) => void) | null = null;
  let biasUnloadCallback: ((source: SourceType) => void) | null = null;

  function setBiasUploadCallback(cb: ((source: SourceType, cloud: GalaxyCatalog) => void) | null): void {
    biasUploadCallback = cb;
  }

  function setBiasUnloadCallback(cb: ((source: SourceType) => void) | null): void {
    biasUnloadCallback = cb;
  }

  // ─── Data upload ────────────────────────────────────────────────────────────

  /**
   * Pack a `GalaxyCatalog` into an interleaved GPU vertex buffer for the given
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
  async function upload(source: SourceType, cloud: GalaxyCatalog): Promise<void> {
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
      const stale = clouds.get(source);
      if (stale) {
        stale.buffer.destroy();
        stale.fadeBuffer.destroy();
        stale.sourceBuffer.destroy();
      }
      clouds.delete(source);
      // The empty-cloud path is semantically an unload — fire the
      // unload callback so the bias-correction subsystem (Spec E phase
      // E.3) can drop any cached ratios/weights for this source.
      biasUnloadCallback?.(source);
      return;
    }

    // ── Run the bake off-thread ─────────────────────────────────────────────
    //
    // `buildRunner` either spawns a fresh Web Worker (production path)
    // or runs the pure function inline (Node test path — see the
    // module-level `setBuildBufferRunner` override).  Each upload uses
    // its own worker instance: parallel surveys can bake simultaneously,
    // and there's no shared-state cleanup between calls.
    //
    // ### Mode = 'fast' always (Spec E phase E.4)
    //
    // Pre-Spec-E this branched on `this.schechterModeActive` and could
    // produce 'with-schechter' to bake the per-galaxy Schechter integral
    // inline.  Phase E.4 moved the bias-mode tracking onto the
    // `biasCorrectionSubsystem`; the renderer no longer knows what mode
    // is active.  If a bias mode is active when this upload finishes,
    // the subsystem fires a per-source bake via the
    // `biasUploadCallback` at the bottom of this method and splices the
    // result into slot 9/10 once it resolves — same observable
    // behaviour as the pre-E.4 inline path, but the rendering and
    // bias-correction concerns are now cleanly separated.
    const result = await buildRunner({
      cloud,
      source,
      mode: 'fast',
    });
    // Note (Spec E phase E.2): the build result still carries
    // `schechter`, `mLim`, `nRef` for backwards compatibility with
    // its other consumers (notably the bake test suite), but the
    // renderer no longer stores them on the LoadedSource entry — the
    // bias-correction subsystem looks them up via `surveyConstants(source)`
    // when it needs them.  See `services/biasCorrection/surveyConstants.ts`.
    const { interleaved } = result;

    // ── Write to GPU ────────────────────────────────────────────────────────
    //
    // Destroy the previous-source state before replacing it (GPU buffers
    // can't be realloc'd; allocating fresh ones of the new size and letting
    // the old ones' VRAM go is the only path).
    const prev = clouds.get(source);
    if (prev) {
      prev.buffer.destroy();
      prev.fadeBuffer.destroy();
      prev.sourceBuffer.destroy();
    }

    const buffer = device.createBuffer({
      label: `points-vertex-buffer-${source}`,
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(buffer, 0, interleaved);

    // FadeUniforms — 16 bytes, written per frame from the registry.
    const fadeBuffer = device.createBuffer({
      label: `points-fade-uniform-${source}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const fadeBindGroup = device.createBindGroup({
      label: `points-fade-bg-${source}`,
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: fadeBuffer } }],
    });

    // SourceUniforms — 16 bytes, written ONCE here at upload time. The
    // 5-bit Source enum value never changes for a given source, so a
    // per-frame write would be wasted bytes. Pack sourceCode into the
    // first 4 bytes; the remaining 12 bytes are reserved padding.
    const sourceBuffer = device.createBuffer({
      label: `points-source-uniform-${source}`,
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const sourceScratch = new ArrayBuffer(16);
    new Uint32Array(sourceScratch)[0] = source >>> 0;
    device.queue.writeBuffer(sourceBuffer, 0, sourceScratch);
    const sourceBindGroup = device.createBindGroup({
      label: `points-source-bg-${source}`,
      layout: sourceBgl,
      entries: [{ binding: 0, resource: { buffer: sourceBuffer } }],
    });

    clouds.set(source, {
      buffer,
      count: cloud.count,
      interleaved,
      fadeBuffer,
      fadeBindGroup,
      sourceBuffer,
      sourceBindGroup,
    });

    // Notify the bias-correction subsystem (Spec E phase E.3) that a
    // source has been committed.  If a bias mode is active, the
    // subsystem fires a per-source bake here.  Null when no subsystem
    // is attached (tests, or pre-attach bootstrap window).
    biasUploadCallback?.(source, cloud);
  }

  /**
   * Remove a source's GPU vertex buffer and reclaim its VRAM.
   *
   * No-op if the source was never uploaded — callers shouldn't have to track
   * which surveys are currently loaded.
   */
  function unload(source: SourceType): void {
    const entry = clouds.get(source);
    if (!entry) return;
    entry.buffer.destroy();
    entry.fadeBuffer.destroy();
    entry.sourceBuffer.destroy();
    clouds.delete(source);
    // Notify the bias-correction subsystem (Spec E phase E.3) so it
    // can drop any cached ratios/weights for the gone source.
    biasUnloadCallback?.(source);
  }

  // ─── Bias-correction splice surface (Spec E phase E.1 + E.4) ──────────────
  //
  // Three layout-aware methods that write per-galaxy bias-correction values
  // straight into the interleaved CPU mirror and re-upload the GPU buffer.
  // The bias-correction subsystem (`biasCorrectionSubsystem.ts`) calls into
  // these once its async worker bakes resolve.  They contain *no* state —
  // no mode flags, no caches, no async, no worker spawn.  The subsystem
  // owns all of that; this surface just lays down what it's told.
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
  // ### Phase history
  //
  // E.1 added these methods alongside the legacy `setBiasMode` / `bake*` /
  // `clear*` / `splice*IntoMirror` family.  E.4 deleted the legacy family
  // entirely — those paths plus their per-LoadedSource caches plus the
  // two `static *Runner` test-injection seams plus the worker `?worker`
  // imports all moved into `biasCorrectionSubsystem.ts`.  What remains
  // here is the renderer's only contribution to bias-correction: the
  // layout-aware byte writes.  See the spec's *Subsystem shape* section
  // for the full split rationale.

  /**
   * Splice a tightly-packed Float32Array of per-row Schechter ratios
   * (length must equal the source's `count`) into slot 9 of every row of
   * the entry's interleaved mirror, then re-upload the whole vertex
   * buffer.  No mode tracking; the caller (subsystem) decides when to
   * call this.
   */
  function spliceSchechterRatios(source: SourceType, ratios: Float32Array): void {
    const entry = clouds.get(source);
    if (!entry) return;
    if (ratios.length !== entry.count) {
      throw new Error(
        `spliceSchechterRatios: length mismatch — got ${ratios.length} ratios, expected ${entry.count}`,
      );
    }
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 9] = ratios[i]!;
    }
    device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
  }

  /**
   * Splice a tightly-packed Float32Array of per-row HEALPix angular
   * weights (length must equal the source's `count`) into slot 10 of
   * every row of the entry's interleaved mirror, then re-upload.
   */
  function spliceAngularWeights(source: SourceType, weights: Float32Array): void {
    const entry = clouds.get(source);
    if (!entry) return;
    if (weights.length !== entry.count) {
      throw new Error(
        `spliceAngularWeights: length mismatch — got ${weights.length} weights, expected ${entry.count}`,
      );
    }
    for (let i = 0; i < entry.count; i++) {
      entry.interleaved[i * SLOTS_PER_POINT + 10] = weights[i]!;
    }
    device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
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
  function clearBiasOverlays(source?: SourceType): void {
    const targets: LoadedSource[] =
      source !== undefined
        ? (() => {
            const entry = clouds.get(source);
            return entry ? [entry] : [];
          })()
        : Array.from(clouds.values());
    for (const entry of targets) {
      for (let i = 0; i < entry.count; i++) {
        entry.interleaved[i * SLOTS_PER_POINT + 9] = 0;
        entry.interleaved[i * SLOTS_PER_POINT + 10] = 0;
      }
      device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
    }
  }

  // ─── Public API for the engine + picker ─────────────────────────────────────

  /**
   * Total number of points across every loaded source. Used by the engine to
   * report cloud size in the status bar.
   */
  function totalCount(): number {
    let total = 0;
    for (const entry of clouds.values()) total += entry.count;
    return total;
  }

  /**
   * Look up the per-source point count, or 0 when the source isn't
   * loaded.  Used by the engine to bounds-check a (source, localIdx)
   * pair before calling `setSelected` or building a GalaxyInfo.
   *
   * Replaces the prior `fromGlobalIdx` decoder: the picker now hands
   * back a structured `{source, localIdx}` directly, so no decoding is
   * needed — but callers still want to ask "is this localIdx within
   * the freshly-uploaded cloud?" because tier swaps can shrink a
   * source's count in flight.  This getter is the smallest possible
   * answer.
   */
  function countOf(source: SourceType): number {
    return clouds.get(source)?.count ?? 0;
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
  // The pre-Spec-F.3 class form used a generator method (`*loadedSources()`)
  // to lazily walk the clouds Map.  In factory shape, the named inner
  // generator function is invoked on each `loadedSources()` call — the
  // returned IterableIterator is fresh per call, matching the previous
  // semantics ("the iterable is generated fresh on each call so the
  // caller may call `unload()` between iterations without affecting the
  // snapshot").  Callers see exactly the same call shape:
  // `for (const e of r.loadedSources()) { ... }` works unchanged.
  function* loadedSourcesGen(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }> {
    for (const source of SURVEY_SOURCES) {
      const entry = clouds.get(source);
      if (!entry) continue;
      yield {
        source,
        vertexBuffer: entry.buffer,
        count: entry.count,
        sourceBuffer: entry.sourceBuffer,
      };
    }
  }
  function loadedSources(): IterableIterator<{
    source: SourceType;
    vertexBuffer: GPUBuffer;
    count: number;
    sourceBuffer: GPUBuffer;
  }> {
    return loadedSourcesGen();
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Write the per-frame uniforms (viewProj, viewport, …) once, then issue one
   * instanced draw call per visible source.
   *
   * @param pass        Active render pass encoder.
   * @param viewProj    Column-major 4×4 view-projection matrix.
   * @param viewportPx  Physical canvas size [w, h] in pixels.
   * @param settings    Per-draw scalar inputs.  See `PointDrawSettings` for the
   *                    full field list — every field flows into the global
   *                    uniform buffer this method writes once, before iterating
   *                    visible sources.
   */
  function draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    settings: PointDrawSettings,
  ): void {
    const {
      pointSizePx,
      brightness,
      selectedPacked,
      visibleSourceMask,
      camPosWorld,
      pxPerRad,
      highlightFallback,
      realOnlyMode,
      biasMode,
      absMagLimit,
      apparentMagLimit,
      schechterMStar,
      schechterAlpha,
      depthFadeEnabled,
      pxFadeStart,
      pxFadeEnd,
    } = settings;
    // Nothing to draw if no source has been uploaded yet.
    if (clouds.size === 0) return;

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

    device.queue.writeBuffer(uniformBuffer, 0, buf);

    // ── Per-source draw loop ────────────────────────────────────────────────
    //
    // Bind the pipeline + global bind group once (these don't change between
    // draws) and then for each loaded source:
    //   1. Skip it if its visibility bit is not set in the mask.
    //   2. Write the registry-read opacity into the per-source fadeBuffer
    //      at @group(1) — each source has its OWN buffer, so writes don't
    //      race against draws against another source.
    //   3. Bind @group(1) (FadeUniforms) and @group(2) (SourceUniforms).
    //   4. Set this source's vertex buffer and issue a 6-vertex × N-instance
    //      draw call.
    //
    // Per-source buffers are exactly what dodges the queue.writeBuffer race:
    // each source has its OWN uniform buffers, so writing this source's
    // fade opacity doesn't race against writes to any other source's
    // uniform between draws within one submit.  See CLAUDE.md →
    // "WebGPU `queue.writeBuffer` race" for the full rationale.
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);

    for (const source of SURVEY_SOURCES) {
      const entry = clouds.get(source);
      if (!entry) continue;

      // Bitmask check: `(mask >> source) & 1`. Equivalent to maskHas() from
      // `data/sources.ts`, inlined here because this is the per-frame hot path.
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      // Read the registry-managed opacity for THIS source's handle and
      // write it into the per-source fadeBuffer. One 16-byte writeBuffer
      // per visible survey per frame — negligible.
      const opacity = settings.fadeOpacityOf(source);
      fadeScratchF32[0] = opacity;
      // f32[1..3] (the three pad slots) stay zero.
      device.queue.writeBuffer(entry.fadeBuffer, 0, fadeScratchBuffer);

      pass.setBindGroup(1, entry.fadeBindGroup);
      pass.setBindGroup(2, entry.sourceBindGroup);
      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(6, entry.count);
    }
  }

  /**
   * Release every GPU resource this renderer owns.
   *
   * ### Why this method exists
   *
   * WebGPU's resource model splits cleanup responsibility unevenly across
   * its object types:
   *
   *   - `GPUBuffer` and `GPUTexture` — the only WebGPU objects that
   *     hold *device-side* memory (VRAM or shared-memory equivalents on
   *     integrated GPUs) — expose explicit `.destroy()` methods.  The
   *     spec is clear: VRAM is NOT released by JavaScript GC alone.
   *     Drop the JS reference and the buffer's bytes stay allocated on
   *     the device until the device itself is dropped.
   *   - `GPURenderPipeline`, `GPUBindGroup`, `GPUBindGroupLayout`,
   *     `GPUShaderModule`, and `GPUSampler` are JS-side handles that
   *     reference device-side state but do not themselves own large
   *     allocations the runtime can return to the system.  These have
   *     NO `.destroy()` method in the WebGPU API; JS GC is the correct
   *     and only release path.  We deliberately do nothing for them
   *     here — there is no `pipeline.destroy()` to call, and assigning
   *     `pipeline = null` would just satisfy a phantom concern
   *     (the binding is closure-captured and the closure itself is
   *     about to drop out of scope).
   *
   * ### Why this method matters in development
   *
   * Production renders one engine per page, so a leak per teardown is
   * bounded and the user navigates away before it matters.  In
   * development the picture is uglier:
   *
   *   - **Vite HMR** swaps the engine module on every save, calling
   *     the old engine's `destroy()` and constructing a fresh one.
   *   - **React StrictMode** double-mounts every component on first
   *     render in development, so even a single page load triggers
   *     one engine teardown plus a second engine construction.
   *
   * Each cycle leaks one full set of per-source vertex buffers
   * (`LoadedSource.buffer` — ~14 MB GPU + ~14 MB CPU mirror per SDSS
   * deck, growing across SDSS + GLADE-large + 2MRS + Famous), each
   * source's per-source fade + source uniform buffers (16 bytes each),
   * plus the renderer's own 176-byte uniform buffer.  After ten saves,
   * browser GPU process memory has climbed past a gigabyte; on a
   * constrained laptop GPU that's enough to wedge the tab.  Wiring
   * this method into `engine.ts`'s `destroy()` chain plateaus the curve.
   *
   * ### Order rationale
   *
   * Per-source buffers go first (vertex, fade, source) — we must finish
   * destroying everything *inside* an entry before dropping the entry's
   * reference from the map.  The renderer's own uniform buffer is
   * destroyed next (independent — no fan-out).  The
   * `clouds.clear()` call goes last so any debug tooling that
   * snapshots the map mid-teardown sees the per-entry buffers already
   * released before the entries themselves vanish — diagnosing a
   * "buffer destroyed but entry still present" symptom is easier than
   * "entry already gone, can't tell what was leaked".
   *
   * ### Why no `pipeline` / `bindGroup` / `bindGroupLayout` cleanup
   *
   * As noted above, none of those types expose `.destroy()`.  The
   * pipeline references shader modules and bind-group layouts;
   * dropping the JS-side handles via the renderer's own GC is
   * sufficient.  No leak here — they don't own VRAM.
   *
   * ### Idempotence
   *
   * The WebGPU spec defines `GPUBuffer.destroy()` as idempotent — a
   * second call on an already-destroyed buffer is a no-op.  This
   * method inherits that property: a second `destroy()` iterates an
   * empty `clouds` map and re-destroys the (already-destroyed)
   * uniform buffer without throwing.  Useful when teardown
   * paths overlap (e.g. an HMR swap fires while React StrictMode is
   * still in its remount cycle).
   */
  function destroy(): void {
    // Per-source teardown.  Each entry owns a vertex buffer, a fade
    // buffer, and a source buffer.
    for (const entry of clouds.values()) {
      entry.buffer.destroy();
      entry.fadeBuffer.destroy();
      entry.sourceBuffer.destroy();
    }
    // Drop JS references to every LoadedSource so GC can collect the
    // ~14 MB CPU mirror (`interleaved` Float32Array) per SDSS deck.
    clouds.clear();
    // The renderer's own per-frame uniform buffer (176 bytes — see
    // UNIFORM_BYTES above).  Tiny, but releasing it is the correct
    // shape and matches what we do for per-source buffers.
    uniformBuffer.destroy();
  }

  // ── Public surface ────────────────────────────────────────────────
  //
  // Build the returned object inline.  `uniformBuffer` ships as a
  // bare property (rather than the pre-factory class's getter)
  // because the closure-captured buffer identity is fixed for the
  // renderer's lifetime — there's nothing to compute lazily.  Every
  // method is a plain function reference, so consumers can destructure
  // (`const { draw, destroy } = createPointRenderer(...)`) without
  // losing `this` binding — there is no `this`.
  const renderer: PointRenderer = {
    label: 'pointRenderer',
    upload,
    unload,
    setBiasUploadCallback,
    setBiasUnloadCallback,
    spliceSchechterRatios,
    spliceAngularWeights,
    clearBiasOverlays,
    totalCount,
    countOf,
    loadedSources,
    uniformBuffer,
    draw,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening `renderer`'s static type (the
  // narrower `PointRenderer` is what consumers see).
  renderer satisfies Renderer;
  return renderer;
}
