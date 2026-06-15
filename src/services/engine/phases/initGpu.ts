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
 *   - `TexturedDiskRenderer`, `ProceduralDiskRenderer`, `MilkyWayRenderer`,
 *     `FilamentRenderer`, … — thumbnail + overlay renderers that write
 *     into the same HDR target as the points pass.
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
 * `device` and `context` survive past this phase via the `phaseLocals`
 * carrier (read by `wireSlots` / `wireInput` / `startLoop`); they have no
 * `state.gpu.*` home. Every renderer is stored on `state.gpu.*` directly,
 * which is also how later phases consume them. See `BootstrapDeps` in
 * `bootstrap.ts` for the wiring.
 */

import { initGpu as gpuInitGpu, resizeCanvasToDisplay } from '../../gpu/device';
import { createPointRenderer } from '../../gpu/renderers/pointRenderer';
import { createPostProcess } from '../../gpu/passes/postProcess';
import { createVolumeOffscreen } from '../../gpu/passes/volumeOffscreen';
import { createTexturedDiskRenderer } from '../../gpu/renderers/texturedDiskRenderer';
import { createProceduralDiskRenderer } from '../../gpu/renderers/proceduralDiskRenderer';
import { createMilkyWayRenderer } from '../../gpu/renderers/milkyWayRenderer';
import { createHorizonShellRenderer } from '../../gpu/renderers/horizonShellRenderer';
import { createFilamentRenderer } from '../../gpu/renderers/filamentRenderer';
import { createLabelRenderer } from '../../gpu/renderers/labelRenderer';
import { createMarkerLineRenderer } from '../../gpu/renderers/markerLineRenderer';
import { createSelectionRingRenderer } from '../../gpu/renderers/selectionRingRenderer';
import { createStructureMarkerRenderer } from '../../gpu/renderers/structureMarkerRenderer';
import { createMilkyWayPickRenderer } from '../../gpu/renderers/milkyWayPickRenderer';
import { createVolumeFieldRenderer } from '../../gpu/renderers/volumeFieldRenderer';
import { createFlowFieldRenderer } from '../../gpu/renderers/flowFieldRenderer';
import { createVolumeUpsample } from '../../gpu/passes/volumeUpsample';
import { createPickDebugOverlay } from '../../gpu/passes/pickDebugOverlay';
import { createDiskRadiusRing } from '../../gpu/passes/diskRadiusRing';
import { createGpuTimingService } from '../../gpu/timing/gpuTimingService';
import { TIMED_SLOT_NAMES } from '../frame/passes';
import { loadFontAtlases } from '../../gpu/labels/loadFontAtlases';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  wireGalaxyCatalogSourceSlot,
} from '../wiring/galaxyCatalogSourceRegistry';
import { createFadeUniformsBgl } from '../../gpu/bindGroupLayouts/fadeUniforms';
import { createSourceUniformsBgl } from '../../gpu/bindGroupLayouts/sourceUniforms';
import { createFocusUniformsBgl } from '../../gpu/bindGroupLayouts/focusUniforms';
import { createFocusUniformBuffer } from '../../gpu/resources/createFocusUniformBuffer';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 1: GPU device acquisition + renderer construction +
 * point-source slot wiring.
 *
 * Side effects on `state`:
 *   - writes `state.gpu.renderer`, `state.gpu.postProcess`,
 *     `state.gpu.filamentRenderer`, and every other renderer handle;
 *   - populates `state.assetSlots.points` via the registry loop.
 *
 * Side effects on `deps`:
 *   - attaches a minimal phase-local carrier (`device`, `context`) so
 *     subsequent phases can read them; the renderers flow via `state.gpu`.
 */
export async function initGpu(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas, cb } = deps;

  // Sync the backing store to the display size *before* handing the canvas
  // to WebGPU — otherwise `getCurrentTexture()` may return a 300×150 default.
  resizeCanvasToDisplay(canvas);

  const { device, context, format } = await gpuInitGpu(canvas);

  // Build the canonical fade + source + focus bind-group layouts ONCE —
  // every renderer pipeline below threads these into createPipelineLayout
  // so each consumer's bind groups are valid across pipelines. See
  // src/services/gpu/bindGroupLayouts/fadeUniforms.ts for the rationale.
  state.gpu.fadeBgl = createFadeUniformsBgl(device);
  state.gpu.sourceBgl = createSourceUniformsBgl(device);
  state.gpu.focusBgl = createFocusUniformsBgl(device);
  // The single shared cluster-focus uniform — written once per frame in
  // renderFrame; its bind group is bound by points, the impostor disks, and
  // the pick pass (each at its own group slot). See EngineGpuHandles.
  state.gpu.focusUniform = createFocusUniformBuffer(device, state.gpu.focusBgl!);

  // ── HDR offscreen target + tone-map post-process ──────────────────
  //
  // Every visible draw pass (points, quads, disks) writes into a
  // viewport-sized rgba16float texture instead of the swap chain.  The
  // tone-map pass then samples the HDR target and writes tone-mapped,
  // compressed-into-[0,1] values into the swap chain.  This eliminates
  // the saturated-white blown-out cluster cores that pure additive
  // blending into bgra8unorm suffers from, and gives the user a runtime
  // curve selector (Linear / Reinhard / Asinh / Gamma 2 / ACES — see
  // `data/toneMapCurve.ts`).
  //
  // The HDR target is recreated on resize (in the frame loop's resize
  // branch) so it always tracks the swap chain size 1:1 — that's also
  // why the tone-map sampler uses 'nearest' (each fragment samples one
  // texel).  The pick renderer's r32uint integer target is separate and
  // never wants tone-mapping.
  //
  // The target + tone-map pass live in one factory (see
  // `services/gpu/postProcess.ts`): they share a lifetime and a
  // swap-chain-format dependency.
  const postProcess = createPostProcess(device, format, {
    width: canvas.width,
    height: canvas.height,
  });
  // Mirror into engine state so `destroy()` can release the resources.
  state.gpu.postProcess = postProcess;

  // Half-res offscreen target for the scalar-volume pass, sized in
  // lockstep with the HDR target.  Conceptually unrelated to postProcess
  // (its only consumer is the volume upsample pass), but constructed and
  // resized at the same sites.
  state.gpu.volumeOffscreen = createVolumeOffscreen(device, {
    width: canvas.width,
    height: canvas.height,
  });

  // PointRenderer (and the disk renderers below) target the HDR
  // rgba16float texture, not the swap-chain `format`.  Their pipelines
  // bake this into a fixed colour-target descriptor at construction
  // time, so the format choice has to land here.
  const renderer = createPointRenderer(
    device,
    'rgba16float',
    state.gpu.fadeBgl!,
    state.gpu.sourceBgl!,
    state.gpu.focusBgl!,
  );
  state.gpu.renderer = renderer;

  // ── Wire the bias-correction subsystem to the freshly-built renderer ──
  //
  // The subsystem was constructed eagerly in the engine state literal
  // (no GPU dep); now that the renderer exists, we hand it over so its
  // splice methods can fire when bakes resolve.  `attachRenderer` also
  // installs the upload/unload callbacks the renderer fires from
  // `upload(...)` / `unload(...)`, so a tier-swap upload mid-mode
  // triggers a per-source bake without any engine-side coordination.
  state.subsystems.biasCorrection.attachRenderer(renderer);

  // ── MSDF label renderer + marker-line renderer ───────────────────────
  //
  // Load the font atlas (BMFont JSON + MSDF PNG) and construct the UI
  // overlay renderers in one block, sequenced after the PointRenderer but
  // before the GALAXY_CATALOG_SOURCE_REGISTRY loop.  Awaiting the atlas
  // fetch here keeps the loop below from racing ahead of it; in practice
  // the ~120 KB atlas resolves well before the much larger per-galaxy-catalog
  // `.bin` fetches.  All renderers share the `{ device, context, format,
  // canvas }` GpuContext shape, so building them here keeps GPU-resource
  // allocation at one site.
  //
  // Stored on `state.gpu` so `engine.ts.destroy()` can release their
  // buffers + atlas texture.  Excluded from `isEngineReady` (same as
  // `filamentRenderer`): optional async resources, null-checked at use.
  //
  // They target the swap-chain format, NOT the HDR target: marker-lines +
  // labels are UI overlays drawn AFTER tone-map onto the swap chain (see
  // `uiOverlay` in `services/engine/frame/`), so their pipelines need the
  // swap-chain format for the colorAttachment to validate.
  const uiCtx = { device, context, format, canvas };

  const fontAtlases = await loadFontAtlases();
  state.gpu.labelRenderer = createLabelRenderer(uiCtx, fontAtlases);
  state.gpu.markerLineRenderer = createMarkerLineRenderer(uiCtx);
  state.gpu.selectionRingRenderer = createSelectionRingRenderer(uiCtx);
  // HDR pass — writes into the rgba16float offscreen target, NOT the
  // swap chain.  The fadeBgl placeholder at @group(1) must match what the
  // other HDR passes (filaments) bind at the same slot on the shared
  // RenderPassEncoder; see the renderer's pipeline-layout comment.
  state.gpu.structureMarkerRenderer = createStructureMarkerRenderer(
    uiCtx,
    'rgba16float',
    state.gpu.fadeBgl!,
  );
  // Invisible Milky-Way pick billboard — writes into the r32uint pick
  // texture (NOT the HDR target), so it takes no format param.  Built
  // here alongside the other pick providers; `wireInput` threads it into
  // `createPickRenderer` along with the disk-visibility gate.
  state.gpu.milkyWayPickRenderer = createMilkyWayPickRenderer(uiCtx, state.gpu.fadeBgl!);

  // Wire the freshly-constructed renderers into the label director, which
  // was built eagerly in the engine state literal with no renderers yet.
  // Same `attachRenderer` post-construction pattern `biasCorrectionSubsystem`
  // uses.  The director owns the renderer refs: all `LabelProducer`s —
  // milkyWayLabel (produceMilkyWayLabel), structures, future overlays — are
  // polled by the director, which merges their outputs and flushes once.
  state.subsystems.labelDirector.attachRenderers(
    state.gpu.labelRenderer,
    state.gpu.markerLineRenderer,
  );

  // ── Per-source asset slots ───────────────────────────────────────────
  //
  // Every galaxy catalog flows through `createAssetSlot`: one cell of mutable
  // LoadState behind a race-checked fetch→commit façade (see
  // `AssetSlot.ts` for the race-check points that fix the tier-swap
  // stomping bug).
  //
  // Constructed here, after `state.gpu.renderer = renderer`, because the
  // commit step uploads the decoded GalaxyCatalog to the renderer — so it
  // must be non-null when commit runs, and the same lexical scope makes
  // that ordering obvious top-down.
  //
  // Commit `await`s `renderer.upload(...)` so a subscriber seeing
  // `kind === 'ready'` can rely on the GPU buffer being populated.  The
  // subscriber's `requestRender()` wakes the render-on-demand loop so the
  // new buffer paints without the user nudging the camera; firing it on
  // the `ready` transition (not inside commit) keeps commit free of UI
  // concerns.
  //
  // The 5 source slots are built from the `GALAXY_CATALOG_SOURCE_REGISTRY`
  // declarative table; sidecar slots (filaments, famous-meta, pgc-aliases)
  // stay inline below — see `galaxyCatalogSourceRegistry.ts` for why.
  for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
    wireGalaxyCatalogSourceSlot(state, cfg, { cb });
  }

  // ── Galaxy thumbnail renderers ─────────────────────────────────────
  //
  // TexturedDiskRenderer targets the HDR offscreen texture (same rationale
  // as PointRenderer above): atlas-bound, 3D-oriented quads sized by
  // per-galaxy diameter, composited into the same linear-light buffer as
  // the points pass.  Matched by the LOD-2 `texturedDisksPass`.
  const texturedDiskRenderer = createTexturedDiskRenderer(
    { device, context, format: 'rgba16float', canvas },
    state.gpu.focusBgl!,
  );
  // ProceduralDiskRenderer fills the visibility gap between the
  // screen-aligned point glow (pixelated above ~8 px) and the
  // textured-disk pass (kicks in at 24 px).  In the 8-14 px band both the
  // points pass and this renderer crossfade via complementary smoothstep
  // alphas (PROCEDURAL_DISK_FADE_START_PX / _END_PX in
  // proceduralDiskSubsystem.ts).  Same HDR target as the other thumbnail
  // renderers.
  const proceduralDiskRenderer = createProceduralDiskRenderer({
    device,
    context,
    format: 'rgba16float',
    canvas,
    focusBgl: state.gpu.focusBgl!,
  });
  // Procedural Milky Way impostor at world origin.  See
  // `services/gpu/milkyWayRenderer.ts` for the rationale on why this
  // is a sibling renderer rather than tucked into the per-galaxy
  // procedural-disk pass, and `utils/math/milkyWayFadeAlpha.ts` for the
  // distance-fade band.
  const milkyWayRenderer = createMilkyWayRenderer({
    device,
    format: 'rgba16float',
  });
  // Observable-universe horizon shell — translucent sphere at the
  // comoving particle-horizon radius (~14.3 Gpc).  Single uniform
  // buffer + baked UV-sphere VBO/IBO, no lifecycle dependencies.
  const horizonShellRenderer = createHorizonShellRenderer({
    device,
    format: 'rgba16float',
  });
  // ── Cosmic-web filament-skeleton renderer ─────────────────────────
  //
  // Built unconditionally (pipeline / quad VBO / uniform buffer are
  // cheap), but the per-instance buffer is populated only when the
  // optional `filaments.bin` exists.  When absent (fresh clone before
  // `npm run build-filaments`), `upload` is never called and `draw`
  // returns early on `segmentCount=0`.  Same HDR target as every overlay.
  const filamentRenderer = createFilamentRenderer(device, 'rgba16float', state.gpu.fadeBgl!);
  state.gpu.filamentRenderer = filamentRenderer;

  // Store the thumbnail-related renderers on `state.gpu.*` so
  // `engine.ts.destroy()` can reach them for teardown, and so later
  // bootstrap phases (`wireSlots`, `startLoop`) consume the same
  // identities by reading `state.gpu.X` directly.
  //
  // Lifecycle invariant: do NOT add these fields to `isEngineReady` (in
  // `helpers/engineReady.ts`).  That predicate intentionally tracks only
  // the five bootstrap-complete fields whose simultaneous non-null state
  // means "every phase has finished" — bootstrap progression isn't the
  // inverse of teardown, and over-eager predicate growth re-creates the
  // black-screen bug class.
  state.gpu.texturedDiskRenderer = texturedDiskRenderer;
  state.gpu.proceduralDiskRenderer = proceduralDiskRenderer;
  state.gpu.milkyWayRenderer = milkyWayRenderer;
  state.gpu.horizonShellRenderer = horizonShellRenderer;

  // ── 3D scalar-field volume renderer ──────────────────────────────────
  //
  // Built unconditionally; the pipeline + corner/index VBOs are cheap
  // (~1 KB GPU).  The large allocations (per-field r16float 3D textures,
  // palette LUTs, uniform buffers) happen only on `handle.addVolumeField`;
  // with no fields registered, `hasActiveFields()` is false and the pass
  // draws nothing.  Same HDR target as every overlay so the raymarch
  // accumulates into the linear-light buffer before tone mapping.
  //
  // Registry wiring goes through onFieldAdded/onFieldRemoved callbacks
  // rather than a direct `fades` reference: scalarVolume is GPU-only (no
  // EngineState dependency), so keeping it FadeRegistry-agnostic leaves
  // the factory pure (testable without a registry stub) and puts the
  // registry-side wiring at the bootstrap layer.
  state.gpu.volumeFieldRenderer = createVolumeFieldRenderer(
    device,
    'rgba16float',
    state.gpu.fadeBgl!,
    {
      onFieldAdded: (id) => {
        // Register at opacity 0 ONLY. Do NOT auto-fade-in here:
        // addVolumeField (the engine.ts wrapper that calls into this
        // factory) drives the fade-in itself, AFTER applying the
        // persisted user enable/disable setting. Auto-fading here
        // would ramp every field's opacity to 1 regardless of
        // whether the user has it toggled off — combined with the
        // draw-loop gate's "opacity > 0 keeps rendering through the
        // fade-out tail", that would draw disabled debug fields by
        // mistake.
        state.subsystems.fades.register({ kind: 'volumeField', id }, 0);
      },
      onFieldRemoved: (id) => {
        state.subsystems.fades.unregister({ kind: 'volumeField', id });
      },
    },
  );

  // ── CF4++ flow-field renderer (the engine's first compute renderer) ─
  //
  // Built unconditionally; the pipelines are cheap and the velocity cube
  // arrives later via the demand-loaded flow slot's commit → upload. The
  // HDR format matches the scalar-volume + upsample targets.
  state.gpu.flowFieldRenderer = createFlowFieldRenderer({ device, hdrFormat: 'rgba16float' });

  // ── Half-res-to-HDR volume upsample pass ──────────────────────────
  //
  // Built unconditionally; the pipeline is cheap and the half-res target
  // lives on `postProcess`, so nothing here depends on viewport size.
  state.gpu.volumeUpsample = createVolumeUpsample(device, 'rgba16float');

  // ── Pick-buffer debug overlay ────────────────────────────────────
  //
  // Fullscreen pass that samples the r32uint pick texture and writes a
  // colour-mapped RGBA image over the tone-mapped swap chain.  Always
  // constructed (cheap, no GPU buffers until first draw); the per-frame
  // consumer gates on `state.settings.debug.showPickBuffer`.  Targets the
  // swap-chain `format` since it draws AFTER tone-map, like marker-lines.
  state.gpu.pickDebugOverlay = createPickDebugOverlay(device, format);

  // ── Disk-radius debug ring ───────────────────────────────────────
  //
  // World-space line-strip drawn in the disk plane around the selected
  // galaxy at its catalog disk radius (a famous-galaxy calibration aid).
  // Swap-chain `format` (post-tone-map UI overlay); the per-frame
  // `diskRadiusRingPass` gates on `state.settings.debug.showDiskRadiusRing`.
  state.gpu.diskRadiusRing = createDiskRadiusRing(device, format);

  // ── GPU timing service ────────────────────────────────────────────
  //
  // Always-constructed: the factory returns a no-op stub when the URL
  // gate is off OR the adapter lacks `timestamp-query`, so consumers gate
  // behind one `state.gpu.timingService.enabled` check.  The no-op path
  // allocates no GPU resources.
  state.gpu.timingService = createGpuTimingService(
    device,
    hasUrlGate('gpuTimings'),
    TIMED_SLOT_NAMES,
  );

  // Stash phase-locals so subsequent phases (`wireSlots`, `wireInput`,
  // `startLoop`) can read the IIFE-scoped device/context handles.  The
  // renderers flow via `state.gpu.*`; this carrier is intentionally
  // minimal — only what has no `state.gpu.*` home.
  deps.phaseLocals = {
    device,
    context,
  };
}
