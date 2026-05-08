/**
 * initGpu — bootstrap phase that owns GPU acquisition + renderer
 * construction.
 *
 * ### What this phase does
 *
 * Acquires the WebGPU device + swap-chain context + format from
 * `initGpu(canvas)` (the lower-level helper in `services/gpu/device.ts`),
 * then constructs every renderer the engine uses:
 *
 *   - `PointRenderer` — instanced billboards into the HDR offscreen
 *     target.  Stored on `state.gpu.renderer`.
 *   - `PostProcess` — combined HDR offscreen rgba16float texture + the
 *     tone-map pass that compresses linear-light into the swap chain.
 *     Stored on `state.gpu.postProcess`.
 *   - `QuadRenderer`, `DiskRenderer`, `ProceduralDiskRenderer` — the
 *     three thumbnail-pass renderers (textured quads for medium
 *     galaxies, oriented disks for large galaxies, procedural fade-in
 *     for the visibility band between point glow and textured disk).
 *     Held in module-local closures rather than `state.gpu.*` because
 *     they're consumed by `wireSlots` (thumbnail subsystem
 *     construction) and `startLoop` (frame-body deps) but never read
 *     by the public-handle setters.
 *   - `MilkyWayRenderer`, `FilamentRenderer` — overlay renderers that
 *     write into the same HDR target as the points pass.  The filament
 *     renderer is stored on `state.gpu.filamentRenderer` because the
 *     `destroy()` path needs to release it.
 *
 * The 5 point-source asset slots are also wired here via the
 * `POINT_SOURCE_REGISTRY` declarative table — `wirePointSourceSlot`'s
 * commit step uploads to `state.gpu.renderer`, so the slots must be
 * minted AFTER renderer construction in the same phase to keep that
 * lifecycle obvious.
 *
 * ### Why this runs first
 *
 * Every later phase depends on the device:
 *   - `wireSlots` commits decoded clouds into `state.gpu.renderer`,
 *     constructs the thumbnail subsystem (wants a `device`), and mints
 *     the filament + sidecar slots that bind to the renderers built
 *     here.
 *   - `wireInput` builds the pick renderer (which shares vertex/uniform
 *     buffers with the visual renderer) and the click resolver.
 *   - `startLoop` packages `device`, `context`, and every renderer into
 *     `RunFrameDeps` for the frame body.
 *
 * ### State writes
 *
 *   - `state.gpu.renderer` (PointRenderer)
 *   - `state.gpu.postProcess` (PostProcess)
 *   - `state.gpu.filamentRenderer` (FilamentRenderer)
 *   - `state.assetSlots.points` (each row of POINT_SOURCE_REGISTRY)
 *
 * ### Async work
 *
 *   - `await initGpu(canvas)` — the WebGPU device-acquisition handshake.
 *
 * ### Outputs threaded forward via the phase module's exports
 *
 * Several IIFE-locals (`device`, `context`, `quadRenderer`,
 * `diskRenderer`, `proceduralDiskRenderer`, `milkyWayRenderer`) need to
 * survive past this phase: `wireSlots` reads them for the thumbnail
 * subsystem; `startLoop` reads them for the frame-body deps.  Rather
 * than expand `EngineState` with per-renderer fields used only inside
 * the bootstrap, we stash them on a phase-local object that the
 * orchestrator passes forward via `BootstrapDeps`.  See `BootstrapDeps`
 * in `bootstrap.ts` for the wiring; the actual stash lives on
 * `state.gpu.*` (renderer, postProcess, filamentRenderer) plus a
 * `phaseLocals` carrier for the rest.  The carrier is intentionally
 * cheap and short-lived — it goes away once `startLoop` finishes.
 */

import { initGpu as gpuInitGpu, resizeCanvasToDisplay } from '../../gpu/device';
import { PointRenderer } from '../../gpu/renderers/pointRenderer';
import { createPostProcess } from '../../gpu/passes/postProcess';
import { type QuadRenderer, createQuadRenderer } from '../../gpu/renderers/quadRenderer';
import { type DiskRenderer, createDiskRenderer } from '../../gpu/renderers/diskRenderer';
import {
  type ProceduralDiskRenderer,
  createProceduralDiskRenderer,
} from '../../gpu/renderers/proceduralDiskRenderer';
import {
  type MilkyWayRenderer,
  createMilkyWayRenderer,
} from '../../gpu/renderers/milkyWayRenderer';
import { FilamentRenderer } from '../../gpu/renderers/filamentRenderer';
import { POINT_SOURCE_REGISTRY, wirePointSourceSlot } from '../wiring/pointSourceRegistry';

import type { EngineState } from '../../../@types';
import type { BootstrapDeps } from './bootstrap';

/**
 * Phase-local carrier for IIFE-scoped renderers/handles that survive
 * past `initGpu` but don't belong on `EngineState`.  `wireSlots` and
 * `startLoop` read this via `deps.phaseLocals`.
 *
 * Intentionally orchestrator-internal — not part of any cross-module
 * contract.  The shared carrier mutation pattern mirrors how the
 * original IIFE used its own closure scope to thread values between
 * sequential blocks.
 *
 * `firstReadySource` is the only field NOT written by `initGpu`;
 * `wireSlots` writes it after the all-arrivals gate resolves so
 * `wireInput` can fire `cb.onStatusChange({ kind: 'ready', source })`
 * with the right `cloudSourceFor` mapping.  Optional because the
 * "no clouds reached GPU" early-return path leaves it null.
 */
export type PhaseLocals = {
  device: GPUDevice;
  context: GPUCanvasContext;
  quadRenderer: QuadRenderer;
  diskRenderer: DiskRenderer;
  proceduralDiskRenderer: ProceduralDiskRenderer;
  milkyWayRenderer: MilkyWayRenderer;
  /**
   * The first survey whose cloud arrived on the GPU with `count > 0`,
   * or `Source.Synthetic` if the synthetic fallback fired.  Read by
   * `wireInput` to populate the `cb.onStatusChange({ kind: 'ready' })`
   * payload.  Written by `wireSlots`.
   */
  firstReadySource: import('../../../data/sources').Source | null;
};

/**
 * Bootstrap phase 1: GPU device acquisition + renderer construction +
 * point-source slot wiring.
 *
 * Side effects on `state`:
 *   - writes `state.gpu.renderer`, `state.gpu.postProcess`,
 *     `state.gpu.filamentRenderer`;
 *   - populates `state.assetSlots.points` via the registry loop.
 *
 * Side effects on `deps`:
 *   - attaches a phase-local carrier (see `PhaseLocals`) so subsequent
 *     phases can read the IIFE-scoped renderer handles.
 */
export async function initGpu(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas, cb } = deps;

  // Sync the backing store to the display size *before* handing the canvas
  // to WebGPU — otherwise `getCurrentTexture()` may return a 300×150 default.
  resizeCanvasToDisplay(canvas);

  const { device, context, format } = await gpuInitGpu(canvas);

  // ── HDR offscreen target + tone-map post-process ──────────────────
  //
  // Every visible draw pass (points, quads, disks) writes into a
  // viewport-sized rgba16float texture instead of the swap chain.  At
  // the end of the frame, the tone-map pass samples the HDR target
  // and writes tone-mapped, compressed-into-[0,1] values into the
  // swap chain.  This eliminates the saturated-white "blown-out"
  // cluster cores that pure additive blending into bgra8unorm
  // suffers from, and gives the user a runtime curve selector so
  // they can compare Linear / Reinhard / Asinh / Gamma 2 / ACES
  // (see `data/toneMapCurve.ts`).
  //
  // The HDR target is recreated on resize (further down in the
  // frame loop's resize branch) so it always tracks the swap chain
  // size 1:1 — that's also why the tone-map sampler uses 'nearest'
  // filtering (each fragment samples a single texel).
  //
  // Pick renderer is unaffected — its r32uint integer target is
  // separate and never wants tone-mapping.  See
  // `docs/superpowers/plans/2026-05-04-hdr-tonemap.md` for the full
  // rationale.
  // Combined HDR offscreen target + tone-map post-process.  See
  // `services/gpu/postProcess.ts` for why these merged into one
  // factory (Phase 4 of the engine-renderer-boundaries spec) —
  // they share a lifetime, share a swap-chain-format dependency,
  // and were previously two separate construction sites that the
  // engine had to thread together for every resize and destroy.
  const postProcess = createPostProcess(device, format, {
    width: canvas.width,
    height: canvas.height,
  });
  // Mirror into the engine state so `destroy()` (defined on the
  // public handle, outside this IIFE) can release the GPU resources.
  state.gpu.postProcess = postProcess;

  // Build the GPU pipeline; cloud data is loaded below.
  // PointRenderer (and QuadRenderer/DiskRenderer further down) target
  // the HDR rgba16float texture instead of the swap-chain `format`.
  // Their pipelines bake this into a fixed colour-target descriptor at
  // construction time, so the format choice has to land here.
  const renderer = new PointRenderer(device, 'rgba16float');
  state.gpu.renderer = renderer;

  // ── Wire the bias-correction subsystem to the freshly-built renderer ──
  //
  // Spec E phase E.3 + E.4.  The subsystem was constructed eagerly in
  // the engine state literal (no GPU dep); now that the renderer
  // exists, we hand it to the subsystem so its splice methods can fire
  // when bakes resolve.  `attachRenderer` also installs the
  // upload/unload callbacks the renderer fires from `upload(...)` /
  // `unload(...)`, so a tier-swap upload mid-mode triggers a per-source
  // bake without any engine-side coordination.  Phase E.4 cut
  // `handle.setBiasMode` over to call `setMode` on this subsystem;
  // production now routes the user's mode toggles through here.
  state.subsystems.biasCorrection.attachRenderer(renderer);

  // ── Per-source asset slots (Task 8 SDSS, Task 9 the rest) ────────────
  //
  // Every survey now flows through `createAssetSlot`.  The slot owns
  // one cell of mutable state (its current LoadState) and exposes
  // the fetch→commit lifecycle behind a race-checked façade — see
  // `AssetSlot.ts`'s header for the full why-and-how, especially
  // the two race-check points that fix the tier-swap stomping bug.
  //
  // Why construct here, after the renderer exists?
  //   The commit step uploads the freshly-decoded PointCloud to
  //   `state.gpu.renderer`, so the renderer must be non-null at the
  //   moment commit runs.  Constructing the slots AFTER
  //   `state.gpu.renderer = renderer` in the same lexical scope
  //   makes that ordering obvious to anyone reading top-down.  An
  //   alternative would be to lazily build slots inside setTier on
  //   first call, but that splits one cohesive subsystem across
  //   two files.
  //
  // Why `await renderer.upload(...)` inside commit?
  //   The slot fires its `committed` event (which transitions the
  //   state to `ready`) only after `commit` resolves.  Awaiting the
  //   GPU upload here — rather than fire-and-forget — guarantees
  //   that subscribers seeing `kind === 'ready'` can rely on the
  //   GPU buffer being populated, which is the primary contract the
  //   asset-loading rework is delivering.  This is also what closes
  //   the race window the old `loadAllClouds` path papered over with
  //   an out-of-band `uploadChain` promise.
  //
  // Why `requestRender()` in the subscriber?
  //   The render loop is gated on `requestRender` — without an
  //   explicit wake-up the new GPU buffer would sit unrendered until
  //   the user nudged the camera.  Firing it on the `ready`
  //   transition (rather than inside `commit`) keeps the slot's
  //   commit step pure of UI concerns; the wake-up is a downstream
  //   side-effect of the slot's state transition, not part of the
  //   commit contract.
  //
  // Naming: `<source>-points` for survey clouds, `filaments` for
  // filaments.  The progress aggregator keys on these strings, so
  // they double as the load-progress identifier.
  //
  // The 5 point-source slots are now constructed via the
  // `POINT_SOURCE_REGISTRY` declarative table — see
  // `pointSourceRegistry.ts` for the registry schema, the per-row
  // fetcher choice, and the rationale for keeping sidecar slots
  // (filaments, famous-meta, pgc-aliases) inline below rather than
  // absorbing them into the registry.  Each call mints the slot,
  // attaches the upload-on-commit body + ready-state subscriber,
  // and stores the slot in `state.assetSlots.points` keyed by
  // `Source` — exactly what the pre-registry inline loop did.
  for (const cfg of POINT_SOURCE_REGISTRY) {
    wirePointSourceSlot(state, cfg, { cb });
  }

  // ── Galaxy thumbnail subsystem ─────────────────────────────────────
  //
  // Three collaborators wired together here:
  //
  //   - thumbnails:   owns the atlas (GPU texture + slot LRU), the
  //                   priority queue, and the per-frame loop that
  //                   allocates slots, kicks off fetches, and emits
  //                   sorted Quad/Disk instances.  See
  //                   `thumbnailSubsystem.ts` for the why-and-how.
  //   - quadRenderer: textured-quad render pass running after the
  //                   point pass each frame.  Engine owns it
  //                   directly (rather than the subsystem) because
  //                   future passes (selection halo) may share it.
  //   - diskRenderer: 3D-oriented disk variant for large galaxies.
  //                   Same ownership story as quadRenderer.
  //
  // `galaxyTexturesEnabled` is mutated by the SettingsPanel toggle.
  // The engine simply skips `thumbnails.runFrame()` when the toggle
  // is off — the LRU clock pauses with it, which is fine because
  // nothing else reads it while the toggle is off.
  //
  // The QuadRenderer/DiskRenderer constructors want a GpuContext;
  // we build them with the four constituents in scope rather than
  // restructuring initGpu's return signature.

  // QuadRenderer targets the HDR offscreen texture (see the rationale
  // at PointRenderer construction above) — it composites galaxy
  // thumbnails into the same accumulated linear-light buffer the
  // points pass writes into.
  const quadRenderer = createQuadRenderer({
    device,
    context,
    format: 'rgba16float',
    canvas,
  });
  // DiskRenderer shares the same atlas as QuadRenderer — both pull from
  // the same 2048×2048 thumbnail texture.  The engine routes each
  // galaxy to one renderer or the other per frame based on apparent
  // size and orientation-data availability (see the per-frame loop).
  const diskRenderer = createDiskRenderer({
    device,
    context,
    format: 'rgba16float',
    canvas,
  });
  // ProceduralDiskRenderer fills the visibility gap between the
  // screen-aligned point glow (which goes pixelated above ~8 px) and
  // the textured-disk pass (which only kicks in at 24 px).  In the
  // 8-14 px band both the points pass and this renderer are active,
  // crossfading via complementary smoothstep alphas (see
  // PROCEDURAL_DISK_FADE_START_PX / _END_PX in thumbnailSubsystem.ts).
  // Same HDR target as the other thumbnail-pass renderers so the
  // procedural disk composites into the same linear-light buffer.
  const proceduralDiskRenderer = createProceduralDiskRenderer({
    device,
    context,
    format: 'rgba16float',
    canvas,
  });
  // Procedural Milky Way impostor at world origin.  See
  // `services/gpu/milkyWayRenderer.ts` for the rationale on why this
  // is a sibling renderer rather than tucked into the per-galaxy
  // procedural-disk pass, and `utils/math/milkyWayFade.ts` for the
  // distance-fade band.
  const milkyWayRenderer = createMilkyWayRenderer({
    device,
    format: 'rgba16float',
  });
  // ── Cosmic-web filament-skeleton renderer ─────────────────────────
  //
  // Built unconditionally (the pipeline / quad VBO / uniform buffer
  // are cheap), but the per-instance buffer is populated only after
  // `loadFilaments()` resolves with a non-null cloud — i.e. when the
  // optional `filaments.bin` exists.  When the binary is absent
  // (fresh clone before `npm run build-filaments`), `upload` is
  // simply never called and `draw` returns early on `segmentCount=0`.
  //
  // Same HDR target as every other overlay so the additive
  // contribution accumulates in float-precision before tone mapping.
  const filamentRenderer = new FilamentRenderer(device, 'rgba16float');
  state.gpu.filamentRenderer = filamentRenderer;

  // Stash phase-locals so subsequent phases (`wireSlots`, `startLoop`)
  // can read the IIFE-scoped device/context/renderer handles.  See
  // `PhaseLocals` above for the rationale on not promoting these to
  // `EngineState`.
  deps.phaseLocals = {
    device,
    context,
    quadRenderer,
    diskRenderer,
    proceduralDiskRenderer,
    milkyWayRenderer,
    firstReadySource: null,
  };
}
