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
 *   - `TexturedQuadRenderer`, `TexturedDiskRenderer`, `ProceduralDiskRenderer` — the
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
 * The 5 galaxy-catalog source asset slots are also wired here via the
 * `GALAXY_CATALOG_SOURCE_REGISTRY` declarative table —
 * `wireGalaxyCatalogSourceSlot`'s commit step uploads to
 * `state.gpu.renderer`, so the slots must be minted AFTER renderer
 * construction in the same phase to keep that lifecycle obvious.
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
 *   - `state.assetSlots.points` (each row of GALAXY_CATALOG_SOURCE_REGISTRY)
 *
 * ### Async work
 *
 *   - `await initGpu(canvas)` — the WebGPU device-acquisition handshake.
 *
 * ### Outputs threaded forward to later phases
 *
 * `device` and `context` survive past this phase via the `phaseLocals`
 * carrier (read by `wireSlots` / `wireInput` / `startLoop`); they don't
 * have a `state.gpu.*` home today.  Every renderer constructed here is
 * stored on `state.gpu.*` directly — the four thumbnail-related renderers
 * (`texturedQuadRenderer`, `texturedDiskRenderer`, `proceduralDiskRenderer`,
 * `milkyWayRenderer`) used to ride on `phaseLocals` too, but M1 of the
 * 2026-05-11 audit collapsed that mirror because phase code already had
 * the same identities reachable via `state.gpu.*`.  See `PhaseLocals`
 * below and `BootstrapDeps` in `bootstrap.ts` for the wiring.
 */

import { initGpu as gpuInitGpu, resizeCanvasToDisplay } from '../../gpu/device';
import { createPointRenderer } from '../../gpu/renderers/pointRenderer';
import { createPostProcess } from '../../gpu/passes/postProcess';
import { createVolumeOffscreen } from '../../gpu/passes/volumeOffscreen';
import { createTexturedQuadRenderer } from '../../gpu/renderers/texturedQuadRenderer';
import { createTexturedDiskRenderer } from '../../gpu/renderers/texturedDiskRenderer';
import { createProceduralDiskRenderer } from '../../gpu/renderers/proceduralDiskRenderer';
import { createMilkyWayRenderer } from '../../gpu/renderers/milkyWayRenderer';
import { createFilamentRenderer } from '../../gpu/renderers/filamentRenderer';
import { createLabelRenderer } from '../../gpu/renderers/labelRenderer';
import { createMarkerLineRenderer } from '../../gpu/renderers/markerLineRenderer';
import { createScalarVolumeRenderer } from '../../gpu/renderers/scalarVolumeRenderer';
import { createVolumeUpsample } from '../../gpu/passes/volumeUpsample';
import { createGpuTimingService } from '../../gpu/timing/gpuTimingService';
import { loadFontAtlases } from '../../gpu/labels/loadFontAtlases';
import { hasUrlGate } from '../../../utils/url/urlGate';
import { GALAXY_CATALOG_SOURCE_REGISTRY, wireGalaxyCatalogSourceSlot } from '../wiring/galaxyCatalogSourceRegistry';
import { createFadeUniformsBgl } from '../../gpu/bindGroupLayouts/fadeUniforms';
import { createSourceUniformsBgl } from '../../gpu/bindGroupLayouts/sourceUniforms';
import { FADE_IN_DURATION_MS } from '../../animation/fadeController';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * PhaseLocals — minimal cross-phase carrier for objects that don't
 * (yet) live on `state.gpu`.
 *
 * Pre-cleanup (M1, 2026-05-11) this bag also carried `texturedQuadRenderer`,
 * `texturedDiskRenderer`, `proceduralDiskRenderer`, `milkyWayRenderer`, and
 * `firstReadySource`.  The four renderers were moved off here because
 * they were duplicates of `state.gpu.X` — phase code now reads them
 * directly with an explicit non-null check that formalises what the
 * previous `deps.phaseLocals!.X` bang silently assumed (phase
 * ordering).  `firstReadySource` became a typed ref on `BootstrapDeps`;
 * passing it through a phase channel was hiding the mutation site.
 *
 * `device` and `context` remain on this bag because they don't have a
 * `state.gpu.*` home today.  Moving them would mean adding them to
 * `EngineGpuHandles` (the shape behind `state.gpu`); out of scope for
 * M1, but tracked as a follow-up in the 2026-05-11 audit.
 */
// PhaseLocals moved to @types/engine/PhaseLocals.d.ts.

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

  // Build the canonical fade + source bind-group layouts ONCE — every
  // renderer pipeline below threads these into createPipelineLayout so
  // each consumer's bind groups are valid across pipelines. See
  // src/services/gpu/bindGroupLayouts/fadeUniforms.ts for the rationale.
  state.gpu.fadeBgl = createFadeUniformsBgl(device);
  state.gpu.sourceBgl = createSourceUniformsBgl(device);

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

  // Half-res offscreen target for the scalar-volume pass.  Sized in
  // lockstep with the HDR target (canvas backing-store dimensions).
  // Conceptually unrelated to postProcess (its only consumer is the
  // volume upsample pass, never the tone-map), but the construction
  // and resize call sites happen to live in the same places.
  state.gpu.volumeOffscreen = createVolumeOffscreen(device, {
    width: canvas.width,
    height: canvas.height,
  });

  // Build the GPU pipeline; cloud data is loaded below.
  // PointRenderer (and TexturedQuadRenderer/TexturedDiskRenderer further down) target
  // the HDR rgba16float texture instead of the swap-chain `format`.
  // Their pipelines bake this into a fixed colour-target descriptor at
  // construction time, so the format choice has to land here.
  const renderer = createPointRenderer(device, 'rgba16float', state.gpu.fadeBgl!, state.gpu.sourceBgl!);
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

  // ── MSDF label renderer + marker-line renderer (Task R4) ──────────────
  //
  // Load the font atlas (BMFont JSON + MSDF PNG) and construct both overlay
  // renderers in one block.  Sequenced here — after the PointRenderer but
  // before the GALAXY_CATALOG_SOURCE_REGISTRY loop — for two reasons:
  //
  //   1. The atlas fetch is short (~120 KB on fast localhost; served from
  //      Cloudflare Workers Assets CDN edge in production).  Awaiting it
  //      here blocks the `for` loop below from racing ahead of the atlas
  //      load, but in practice the atlas resolves well before the much
  //      larger per-survey `.bin` fetches finish.
  //
  //   2. Both renderers need a `GpuContext` shaped as `{ device, context,
  //      format, canvas }` — the same shape the TexturedQuadRenderer / TexturedDiskRenderer
  //      below use.  Constructing them here keeps all "GPU resource allocation
  //      from a GpuContext" at one cohesive site.
  //
  // These renderers are stored on `state.gpu` (unlike `texturedQuadRenderer` /
  // `milkyWayRenderer` which stay phase-local) because the `destroy()`
  // method in `engine.ts` needs to release their GPU buffers + atlas
  // texture.  They're excluded from `isEngineReady` for the same
  // reason as `filamentRenderer`: optional async resources, null-
  // checked at point of use.
  //
  // ### Why the swap-chain format, not the HDR target
  //
  // Marker-lines + labels are UI overlay drawn AFTER tone-map onto
  // the swap chain (see `uiOverlay` in `services/engine/frame/`).
  // Their pipelines are constructed with the swap-chain format so
  // the WebGPU validation lines up at the colorAttachment.  Drawing
  // INTO the HDR target (rgba16float) used to require an `[8, 8, 8, 1]`
  // overshoot to survive the tone-map compression; with the post-
  // tone-map pass `[1, 1, 1, 1]` is correct (and matches what the
  // `youAreHereSubsystem` now emits).
  const uiCtx = { device, context, format, canvas };

  const fontAtlases = await loadFontAtlases();
  state.gpu.labelRenderer = createLabelRenderer(uiCtx, fontAtlases);
  state.gpu.markerLineRenderer = createMarkerLineRenderer(uiCtx);

  // Wire the freshly-constructed renderers into the label director.
  // The director was built eagerly in the engine state literal (alongside
  // `tweens`, `biasCorrection`, etc.) but had no renderers to call into yet.
  // This is the same `attachRenderer` post-construction wiring pattern that
  // `biasCorrectionSubsystem` uses — see that module's header comment for
  // the "why renderers are null at eager-construction time" rationale.
  //
  // Post-Task-6: the director (not youAreHere directly) owns the renderer
  // refs.  All `LabelProducer`s — youAreHere, pois, future overlays — are
  // polled by the director, which merges their outputs and flushes once.
  state.subsystems.labelDirector.attachRenderers(
    state.gpu.labelRenderer,
    state.gpu.markerLineRenderer,
  );

  // ── Per-source asset slots (Task 8 SDSS, Task 9 the rest) ────────────
  //
  // Every survey now flows through `createAssetSlot`.  The slot owns
  // one cell of mutable state (its current LoadState) and exposes
  // the fetch→commit lifecycle behind a race-checked façade — see
  // `AssetSlot.ts`'s header for the full why-and-how, especially
  // the two race-check points that fix the tier-swap stomping bug.
  //
  // Why construct here, after the renderer exists?
  //   The commit step uploads the freshly-decoded GalaxyCatalog to
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
  // The 5 galaxy-catalog source slots are now constructed via the
  // `GALAXY_CATALOG_SOURCE_REGISTRY` declarative table — see
  // `galaxyCatalogSourceRegistry.ts` for the registry schema, the per-row
  // fetcher choice, and the rationale for keeping sidecar slots
  // (filaments, famous-meta, pgc-aliases) inline below rather than
  // absorbing them into the registry.  Each call mints the slot,
  // attaches the upload-on-commit body + ready-state subscriber,
  // and stores the slot in `state.assetSlots.points` keyed by
  // `Source` — exactly what the pre-registry inline loop did.
  for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
    wireGalaxyCatalogSourceSlot(state, cfg, { cb });
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
  //   - texturedQuadRenderer: textured-quad render pass running after the
  //                   point pass each frame.  Engine owns it
  //                   directly (rather than the subsystem) because
  //                   future passes (selection halo) may share it.
  //   - texturedDiskRenderer: 3D-oriented disk variant for large galaxies.
  //                   Same ownership story as texturedQuadRenderer.
  //
  // `galaxyTexturesEnabled` is mutated by the SettingsPanel toggle.
  // The engine simply skips `thumbnails.runFrame()` when the toggle
  // is off — the LRU clock pauses with it, which is fine because
  // nothing else reads it while the toggle is off.
  //
  // The TexturedQuadRenderer/TexturedDiskRenderer constructors want a GpuContext;
  // we build them with the four constituents in scope rather than
  // restructuring initGpu's return signature.

  // TexturedQuadRenderer targets the HDR offscreen texture (see the rationale
  // at PointRenderer construction above) — it composites galaxy
  // thumbnails into the same accumulated linear-light buffer the
  // points pass writes into.
  const texturedQuadRenderer = createTexturedQuadRenderer({
    device,
    context,
    format: 'rgba16float',
    canvas,
  });
  // TexturedDiskRenderer shares the same atlas as TexturedQuadRenderer — both pull from
  // the same 2048×2048 thumbnail texture.  The engine routes each
  // galaxy to one renderer or the other per frame based on apparent
  // size and orientation-data availability (see the per-frame loop).
  const texturedDiskRenderer = createTexturedDiskRenderer({
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
  const filamentRenderer = createFilamentRenderer(device, 'rgba16float', state.gpu.fadeBgl!);
  state.gpu.filamentRenderer = filamentRenderer;

  // Store the four thumbnail-related renderers on `state.gpu.*` so
  // `engine.ts.destroy()` has a reachable reference path for teardown,
  // AND so the later bootstrap phases (`wireSlots`, `startLoop`) can
  // consume them by reading `state.gpu.X` directly.  Pre-2026-05-08
  // these four renderers lived only on `phaseLocals` — PR #66 flagged
  // that `destroy()` couldn't reach them.  The initial fix mirrored
  // them onto `state.gpu.*` for destroy reachability while leaving the
  // phase-side reads pointing at `phaseLocals`; M1 of the 2026-05-11
  // audit collapsed that mirror, so `state.gpu.*` is now the single
  // home for these references.
  //
  // **Lifecycle note for future contributors.**  Do NOT add these four
  // fields to `isEngineReady` (in `helpers/engineReady.ts`).  They're
  // populated during `initGpu` (the first phase), but the predicate
  // intentionally tracks only the five bootstrap-complete fields whose
  // simultaneous non-null state means "every phase has finished".  The
  // 2026-05-08 black-screen incident is the cautionary tale: bootstrap
  // progression isn't the inverse of teardown, and over-eager predicate
  // growth re-creates that bug class.
  state.gpu.texturedQuadRenderer = texturedQuadRenderer;
  state.gpu.texturedDiskRenderer = texturedDiskRenderer;
  state.gpu.proceduralDiskRenderer = proceduralDiskRenderer;
  state.gpu.milkyWayRenderer = milkyWayRenderer;

  // ── 3D scalar-field volume renderer ──────────────────────────────────
  //
  // Built unconditionally alongside the other overlay renderers.  The
  // pipeline + corner/index VBOs are cheap (~1 KB of GPU memory); the
  // large allocations (per-field r16float 3D textures, palette LUT
  // textures, uniform buffers) happen only when the caller invokes
  // `handle.addVolumeField(...)`.  When no fields are registered,
  // `hasActiveFields()` returns false and the pass draws nothing at zero
  // GPU cost.
  //
  // Same HDR target as every other overlay (`'rgba16float'`) so the
  // raymarch accumulates into the same linear-light buffer before tone
  // mapping.  Stored on `state.gpu` so `destroy()` can release the
  // shared corner/index VBOs and every per-field GPU resource.
  state.gpu.scalarVolumeRenderer = createScalarVolumeRenderer(
    device,
    'rgba16float',
    state.gpu.fadeBgl!,
    {
      onFieldAdded: (handle) => {
        state.subsystems.fades.register({ kind: 'scalarField', field: handle }, 0);
        // Fade in on first upload — fire and forget.
        void state.subsystems.fades.fadeTo(
          { kind: 'scalarField', field: handle },
          1,
          FADE_IN_DURATION_MS,
        );
      },
      onFieldRemoved: (handle) => {
        state.subsystems.fades.unregister({ kind: 'scalarField', field: handle });
      },
    },
  );

  // ── Half-res-to-HDR volume upsample pass ──────────────────────────
  //
  // Built unconditionally alongside the scalar-volume renderer; the
  // pipeline is cheap (one sampler + one bind-group-layout + one render
  // pipeline) and the half-res target lives on `postProcess` so we have
  // nothing to allocate here that depends on viewport size.  Stored on
  // `state.gpu` so `destroy()` can release the pipeline and so the new
  // `volumeUpsamplePass` can read it via `state.gpu.volumeUpsample`.
  state.gpu.volumeUpsample = createVolumeUpsample(device, 'rgba16float');

  // ── GPU timing service ────────────────────────────────────────────
  //
  // Always-constructed: the factory takes the URL-gate result and
  // returns a no-op stub when the gate is off OR the adapter lacks
  // `timestamp-query`.  Consumers gate work behind one check
  // (`if (state.gpu.timingService.enabled)`) instead of juggling
  // null + flag combinations.  The no-op path allocates no GPU
  // resources, so always-constructing is free.
  state.gpu.timingService = createGpuTimingService(device, hasUrlGate('gpuTimings'));

  // Stash phase-locals so subsequent phases (`wireSlots`, `wireInput`,
  // `startLoop`) can read the IIFE-scoped device/context handles.  The
  // renderers themselves now flow via `state.gpu.*` (see the mirror
  // block above); this carrier is intentionally minimal — only the
  // things without a `state.gpu.*` home today.  See `PhaseLocals`
  // above for the rationale on what does (and doesn't) live here
  // after M1.
  deps.phaseLocals = {
    device,
    context,
  };
}
