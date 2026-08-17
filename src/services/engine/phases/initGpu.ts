/**
 * initGpu — bootstrap phase that acquires the WebGPU device + swap-chain
 * context, then constructs every renderer the engine uses (points, disks,
 * Milky Way, filaments, bodies, …), all writing into the shared HDR
 * offscreen target set up here. Runs first because every later phase depends
 * on the device: `wireSlots` commits decoded clouds and mints slots that
 * bind to these renderers, `wireInput` builds the pick renderer, `startLoop`
 * packages everything into `RunFrameDeps`.
 *
 * `device` / `context` survive past this phase via the `phaseLocals` carrier
 * (see `BootstrapDeps` in `bootstrap.ts`); `state.gpu.uiCtx` is a separate,
 * narrower home for the same two values (plus `canvas`), read only by
 * `buildSwapRenderers` for a later swap-format rebuild. Every renderer is
 * stored on `state.gpu.*` directly.
 */

import { initGpu as gpuInitGpu, resizeCanvasToDisplay, watchHdrCapability } from '../../gpu/device';
import { createPointRenderer } from '../../gpu/renderers/galaxyCatalog/pointRenderer';
import { createCompositor } from '../../gpu/passes/compositor';
import { createRenderTargets } from '../../gpu/renderTargets';
import { createTexturedDiskRenderer } from '../../gpu/renderers/galaxyCatalog/texturedDiskRenderer';
import { createProceduralDiskRenderer } from '../../gpu/renderers/galaxyCatalog/proceduralDiskRenderer';
import { createMilkyWayCloud } from '../galaxyGenerator/v1/milkyWayCloud';
import { MILKY_WAY_TUNING_DEFAULTS } from '../galaxyGenerator/v1/milkyWayCalibration';
import { createMilkyWayCloudRenderer } from '../../gpu/renderers/milkyWay/milkyWayCloudRenderer';
import { createHorizonShellRenderer } from '../../gpu/renderers/horizonShell/horizonShellRenderer';
import { createZoneOfAvoidanceRenderer } from '../../gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer';
import { createFilamentRenderer } from '../../gpu/renderers/filaments/filamentRenderer';
import { createConstellationRenderer } from '../../gpu/renderers/constellations/constellationRenderer';
import { createStructureMarkerRenderer } from '../../gpu/renderers/structureMarker/structureMarkerRenderer';
import { createMilkyWayPickRenderer } from '../../gpu/renderers/milkyWay/milkyWayPickRenderer';
import { createVolumeFieldRenderer } from '../../gpu/renderers/volumeField/volumeFieldRenderer';
import { createFlowFieldRenderer } from '../../gpu/renderers/flowField/flowFieldRenderer';
import { createAdditiveUpsample } from '../../gpu/passes/additiveUpsample';
import { createStarAggregateUpsample } from '../../gpu/passes/starAggregateUpsample';
import { createBloomPyramid } from '../../gpu/passes/bloomPyramid';
import { createEarthRenderer } from '../../gpu/renderers/bodies/earthRenderer';
import { createTexturedBodyRenderer } from '../../gpu/renderers/bodies/texturedBodyRenderer';
import { createRingRenderer } from '../../gpu/renderers/bodies/ringRenderer';
import { createCloudShellRenderer } from '../../gpu/renderers/bodies/cloudShellRenderer';
import { createAtmosphereShellRenderer } from '../../gpu/renderers/atmosphere/atmosphereShellRenderer';
import { ATMOSPHERE_PARAMS } from '../../../data/bodies/atmosphereParams';
import { createStarRenderer } from '../../gpu/renderers/bodies/starRenderer';
import { createPlanetRenderer } from '../../gpu/renderers/bodies/planetRenderer';
import { createStarPointRenderer } from '../../gpu/renderers/bodies/starPointRenderer';
import { createBodyGlintRenderer } from '../../gpu/renderers/bodies/bodyGlintRenderer';
import { createStarCatalogRenderer } from '../../gpu/renderers/starCatalog/starCatalogRenderer';
import { createStarCatalogPickRenderer } from '../../gpu/renderers/starCatalog/starCatalogPickRenderer';
import { createBodyPickRenderer } from '../../gpu/renderers/bodies/bodyPickRenderer';
import { createOrbitTrailRenderer } from '../../gpu/renderers/bodies/orbitTrailRenderer';
import { deriveBodyStates } from '../frame/deriveBodyStates';
import { CONST_J2000 } from '../../../data/time/constJ2000';
import { createGpuTimingService } from '../../gpu/timing/gpuTimingService';
import { TIMED_SLOTS } from '../frame/frameProgram';
import { SLAB_REVERSED_Z, NEAR0, COSMO } from '../frame/slabs';
import { loadFontAtlases } from '../../gpu/labelLayout/loadFontAtlases';
import { engineHdrCapabilityChanged } from '../../../state/engine/engineSlice';
import { buildSwapRenderers } from './buildSwapRenderers';
import { hasUrlGate } from '../../../utils/url/hasUrlGate';
import { isPerfMode } from '../../../utils/url/isPerfMode';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  wireGalaxyCatalogSourceSlot,
} from '../wiring/galaxyCatalogSourceRegistry';
import { wireBodyTextureSlots } from '../wiring/bodyTextureSlotRegistry';
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
 *   - writes `state.gpu.renderer`, `state.gpu.renderTargets`,
 *     `state.gpu.filamentRenderer`, and every other renderer handle;
 *   - populates `state.assetSlots.points` via the registry loop.
 *
 * Side effects on `deps`:
 *   - attaches a minimal phase-local carrier (`device`, `context`,
 *     `unwatchHdrCapability`) so subsequent phases can read them and
 *     `engine.ts`'s `destroy()` can remove the HDR media-query listener; the
 *     renderers flow via `state.gpu`.
 */
export async function initGpu(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { canvas, cb } = deps;

  // Sync the backing store to the display size *before* handing the canvas
  // to WebGPU — otherwise `getCurrentTexture()` may return a 300×150 default.
  resizeCanvasToDisplay(canvas);

  const { device, context, format, hdrCapable } = await gpuInitGpu(canvas);

  // Live display-capability report: dispatch the boot snapshot now, then
  // keep the engine slice honest as the display's `(dynamic-range: high)`
  // verdict changes later (e.g. the window moves to an SDR monitor) — see
  // `watchHdrCapability`'s doc comment in `device.ts`. `deps.phaseLocals` is
  // assigned immediately below, not at the end of this (long, throw-capable)
  // phase, so a later throw here — the font-atlas await, any renderer
  // constructor — still leaves `engine.ts`'s `destroy()` able to remove the
  // listener rather than leaking it for the page's lifetime.
  deps.cb.store.dispatch(engineHdrCapabilityChanged(hdrCapable));
  const unwatchHdrCapability = watchHdrCapability((capable) =>
    deps.cb.store.dispatch(engineHdrCapabilityChanged(capable)),
  );
  deps.phaseLocals = { device, context, unwatchHdrCapability };

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

  // ── Offscreen render-target table + compositor tone-map ────────────
  //
  // Every visible draw pass (points, quads, disks) writes into the
  // viewport-sized rgba16float `hdr` row instead of the swap chain.  The
  // compositor's tone-map curve then samples the HDR target and writes
  // tone-mapped, compressed-into-[0,1] values into the swap chain.  This
  // eliminates the saturated-white blown-out cluster cores that pure
  // additive blending into bgra8unorm suffers from, and gives the user a
  // runtime curve selector (Linear / Reinhard / Asinh / Gamma 2 / ACES —
  // see `data/toneMapCurve.ts`).
  //
  // The offscreen rows are recreated on resize (one `renderTargets.resize`
  // in the frame loop's resize branch) so the HDR row always tracks the
  // swap chain size 1:1 — that's also why the compositor's sampler uses
  // 'nearest' for the tone-map composite (each fragment samples one
  // texel).  The 1/3-scale `volume` row rides in the same table; the pick
  // renderer's r32uint integer target is separate for now and never wants
  // tone-mapping.  See `renderTargets.ts` for the per-row rationale.

  // Unified compositor — one pipeline cache serves every offscreen→target
  // merge the engine performs (the FRAME program's tone-mapped hdr→swap
  // composite, plus the foreground-OVER and additive-field composites other
  // passes will adopt).  The blend→dstFormat table is baked in at
  // construction, as data, rather than threaded per-draw, because a
  // render-pass encoder cannot be queried for its own colour-attachment
  // format — the caller has to hand it over up front.
  const compositor = createCompositor({ device, swapFormat: format, hdrFormat: 'rgba16float' });
  state.gpu.compositor = compositor;

  // The `mw-aggregate` row's divisor is a live knob rather than a table
  // constant, so the boot value has to be handed in. It comes from the
  // calibration module (the home of every Milky-Way boot value) rather than
  // from `state.settings`: this phase seeds the GPU side, and the frame loop
  // already rebuilds the table whenever the live setting diverges — reading
  // settings here would add a second path to the same answer.
  state.gpu.renderTargets = createRenderTargets(
    device,
    format,
    { width: canvas.width, height: canvas.height },
    MILKY_WAY_TUNING_DEFAULTS.aggregateDivisor,
  );

  // PointRenderer (and the disk renderers below) target the HDR
  // rgba16float texture, not the swap-chain `format`.  Their pipelines
  // bake this into a fixed colour-target descriptor at construction
  // time, so the format choice has to land here.
  const renderer = createPointRenderer({
    device,
    targetFormat: 'rgba16float',
    fadeBgl: state.gpu.fadeBgl!,
    sourceBgl: state.gpu.sourceBgl!,
    focusBgl: state.gpu.focusBgl!,
  });
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

  // ── Swap-chain-format renderers (labels, marker lines, debug lines,
  // selection ring, pick-debug overlay, disk-radius ring, + their NEAR0
  // foreground twins) ────────────────────────────────────────────────────
  //
  // Load the font atlas (BMFont JSON + MSDF PNG) before building anything
  // that reads it, sequenced after the PointRenderer but before the
  // GALAXY_CATALOG_SOURCE_REGISTRY loop.  Awaiting the atlas fetch here keeps
  // the loop below from racing ahead of it; in practice the ~120 KB atlas
  // resolves well before the much larger per-galaxy-catalog `.bin` fetches.
  // `uiCtx` and the atlas are retained on `state.gpu` (not just local here)
  // so `buildSwapRenderers` can rebuild these eight renderers on a later
  // swap-format change — see its module header. The two renderer calls
  // just below need the full `GpuContext` (format included); `state.gpu.uiCtx`
  // deliberately gets its own format-less literal, matching its narrower
  // type — see that field's docblock in `EngineGpuHandles`.
  const uiCtx = { device, context, format, canvas, hdrCapable };
  state.gpu.uiCtx = { device, context, canvas, hdrCapable };
  state.gpu.fontAtlases = await loadFontAtlases();
  buildSwapRenderers(state, format);

  // HDR pass — writes into the rgba16float offscreen target, NOT the
  // swap chain.  The fadeBgl placeholder at @group(1) must match what the
  // other HDR passes (filaments) bind at the same slot on the shared
  // RenderPassEncoder; see the renderer's pipeline-layout comment.
  state.gpu.structureMarkerRenderer = createStructureMarkerRenderer(
    uiCtx,
    'rgba16float',
    state.gpu.fadeBgl!,
    SLAB_REVERSED_Z[COSMO]!,
  );
  // Invisible Milky-Way pick billboard — writes into the r32uint pick
  // texture (NOT the HDR target), so it takes no format param.  Built
  // here alongside the other pick providers; `wireInput` threads it into
  // `createPickRenderer` along with the disk-visibility gate.
  state.gpu.milkyWayPickRenderer = createMilkyWayPickRenderer(
    uiCtx,
    state.gpu.fadeBgl!,
    SLAB_REVERSED_Z[NEAR0]!,
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
  // The 7 source slots (6 galaxy catalogs + Synthetic) are built from the
  // `GALAXY_CATALOG_SOURCE_REGISTRY` declarative table; sidecar slots
  // (filaments, famous-galaxies-meta, pgc-aliases) stay inline below — see
  // `galaxyCatalogSourceRegistry.ts` for why.
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
    { device, context, targetFormat: 'rgba16float', canvas },
    state.gpu.focusBgl!,
  );
  // ProceduralDiskRenderer fills the visibility gap between the
  // screen-aligned point glow (pixelated above ~8 px) and the
  // textured-disk pass (kicks in at 24 px).  In the 8-14 px band both the
  // points pass and this renderer crossfade via complementary smoothstep
  // alphas (PROCEDURAL_DISK_FADE_START_PX / _END_PX in
  // data/galaxyLodBands.ts).  Same HDR target as the other thumbnail
  // renderers.
  const proceduralDiskRenderer = createProceduralDiskRenderer({
    device,
    context,
    targetFormat: 'rgba16float',
    canvas,
    focusBgl: state.gpu.focusBgl!,
    reversedZ: SLAB_REVERSED_Z[COSMO]!,
  });
  // Observable-universe horizon shell — translucent sphere at the
  // comoving particle-horizon radius (~14.3 Gpc).  Single uniform
  // buffer + baked UV-sphere VBO/IBO, no lifecycle dependencies.
  const horizonShellRenderer = createHorizonShellRenderer({
    device,
    targetFormat: 'rgba16float',
  });
  // Galactic-plane dust-band guide — same lifecycle as horizonShellRenderer
  // (unconditional, no data-delivery dependency), same HDR target. Its
  // curved-lettering pipeline reuses `state.gpu.fontAtlases` (already loaded
  // above by `loadFontAtlases()`), not a second atlas fetch.
  const zoneOfAvoidanceRenderer = createZoneOfAvoidanceRenderer(
    device,
    'rgba16float',
    state.gpu.fontAtlases!,
  );
  state.gpu.zoneOfAvoidanceRenderer = zoneOfAvoidanceRenderer;
  // ── Cosmic-web filament-skeleton renderer ─────────────────────────
  //
  // Built unconditionally (pipeline / quad VBO / uniform buffer are
  // cheap), but the per-instance buffer is populated only when the
  // optional `filaments.bin` exists.  When absent (fresh clone before
  // `npm run build-filaments`), `upload` is never called and `draw`
  // returns early on `segmentCount=0`.  Same HDR target as every overlay.
  const filamentRenderer = createFilamentRenderer(device, 'rgba16float', state.gpu.fadeBgl!);
  state.gpu.filamentRenderer = filamentRenderer;

  // ── Constellation stick-figure renderer ──────────────────────────
  //
  // Built unconditionally beside filaments (same cheap instanced-quad
  // pipeline + shared unit-quad VBO + fade uniform). The per-instance buffer
  // is populated later, when `constellationsLayer` sees the demand-loaded
  // `constellations.json` artifact ready on its slot and calls `upload` once.
  // Until then `hasData()` is false and the layer skips its draw. Same HDR
  // target as every overlay.
  const constellationRenderer = createConstellationRenderer(
    device,
    'rgba16float',
    state.gpu.fadeBgl!,
  );
  state.gpu.constellationRenderer = constellationRenderer;

  // Store the thumbnail-related renderers on `state.gpu.*` so
  // `engine.ts.destroy()` can reach them for teardown, and so later
  // bootstrap phases (`wireSlots`, `startLoop`) consume the same
  // identities by reading `state.gpu.X` directly.
  //
  // Lifecycle invariant: do NOT add these fields to `isEngineReady` (in
  // `helpers/engineReady.ts`).  That predicate intentionally tracks only the
  // handful of bootstrap-complete fields whose simultaneous non-null state
  // means "every phase has finished" — bootstrap progression isn't the
  // inverse of teardown, and over-eager predicate growth re-creates the
  // black-screen bug class.
  state.gpu.texturedDiskRenderer = texturedDiskRenderer;
  state.gpu.proceduralDiskRenderer = proceduralDiskRenderer;
  state.gpu.horizonShellRenderer = horizonShellRenderer;

  // ── Milky-Way point cloud + its two-pass renderer ────────────────────
  //
  // The GPU-generated star/dust cloud (`milkyWayCloud`) owns the instance
  // buffers; the additive-stars + multiplicative-dust renderer
  // (`milkyWayCloudRenderer`) draws them from `milkyWayLayer`. Same HDR
  // target ('rgba16float') as the other overlay renderers.
  //
  // The boot starCount comes from `MILKY_WAY_TUNING_DEFAULTS` (the same
  // calibration-module source `aggregateDivisor` reads above, for the render
  // targets table), not from `state.settings`: this phase seeds the GPU
  // side, and `runFrame` already regenerates the cloud whenever the live
  // setting diverges from what the current buffers were generated with —
  // reading settings here would add a second path to the same answer. That
  // mismatch branch also covers a later tier swap: `watchTierSaga` re-seeds
  // `settings.milkyWay.starCount` from the new tier's budget, which is just
  // another live-setting change from the cloud's point of view — it carries
  // no notion of `Tier` itself (see `MilkyWayCloud`'s docblock).
  state.gpu.milkyWayCloud = createMilkyWayCloud(device, MILKY_WAY_TUNING_DEFAULTS.starCount);
  state.gpu.milkyWayCloudRenderer = createMilkyWayCloudRenderer({
    device,
    targetFormat: 'rgba16float',
  });

  // ── 3D scalar-field volume renderer ──────────────────────────────────
  //
  // Built unconditionally; the pipeline + corner/index VBOs are cheap
  // (~1 KB GPU).  The large allocations (per-field r16float 3D textures,
  // palette LUTs, uniform buffers) happen only on `handle.addVolumeField`;
  // with no fields registered, `hasActiveFields()` is false and the pass
  // draws nothing.  Same HDR target as every overlay so the raymarch
  // accumulates into the linear-light buffer before tone mapping.
  //
  // The renderer is fully FadeRegistry-agnostic: it neither registers nor
  // unregisters fade handles. The fade-ownership manifest (`seedFades`)
  // registers the entire volume-field set — including the DEV-only debug
  // fixtures — at construction, so every `fadeTo({kind:'volumeField'})` finds
  // a registered handle regardless of which fields are currently uploaded.
  state.gpu.volumeFieldRenderer = createVolumeFieldRenderer(
    device,
    'rgba16float',
    state.gpu.fadeBgl!,
  );

  // ── CF4++ flow-field renderer (the engine's first compute renderer) ─
  //
  // Built unconditionally; the pipelines are cheap and the velocity cube
  // arrives later via the demand-loaded flow slot's commit → upload. The
  // HDR format matches the scalar-volume + upsample targets.
  state.gpu.flowFieldRenderer = createFlowFieldRenderer({ device, targetFormat: 'rgba16float' });

  // ── Half-res-to-HDR volume upsample pass ──────────────────────────
  //
  // Built unconditionally; the pipeline is cheap and the 1/3-scale target
  // lives on `renderTargets`, so nothing here depends on viewport size.
  state.gpu.volumeUpsample = createAdditiveUpsample(device, 'rgba16float');

  // ── Reduced-res-to-HDR Milky Way star-field composite ─────────────
  //
  // A SECOND instance of the same factory (which is generic — a filtered
  // additive blit of whatever view it is handed). Deliberately not the volume's
  // handle: sharing one would braid two independently-gated subsystems onto a
  // single resource.
  state.gpu.milkyWayAggregateUpsample = createAdditiveUpsample(device, 'rgba16float');

  // ── Reduced-res-to-HDR zone-of-avoidance band composite ────────────
  //
  // Another instance of the same generic factory. Deliberately not the
  // volume's or the Milky Way's handle — sharing one would braid three
  // independently-gated subsystems onto a single resource.
  state.gpu.zoneOfAvoidanceUpsample = createAdditiveUpsample(device, 'rgba16float');

  // ── Half-res survey-star aggregate upsample composite ─────────────
  //
  // Built unconditionally alongside the volume upsample; the pipeline is cheap
  // and the half-res `star-aggregates` target lives on `renderTargets`. Reads
  // that offscreen, re-applies the star pass's hue-preserving knee to the
  // summed aggregate field, and adds it into HDR. Targets 'rgba16float' — both
  // the HDR and the star-aggregates rows share that format.
  state.gpu.starAggregateUpsample = createStarAggregateUpsample(device, 'rgba16float');

  // ── Bloom mip pyramid (bright / downsample / upsample / fold) ──────
  //
  // Built unconditionally alongside the other post-process passes; the four
  // pipelines are cheap and the `bloom0..bloom4` mip textures live on
  // `renderTargets` (recreated on resize), so nothing here depends on viewport
  // size. Targets 'rgba16float' — the HDR + every bloom row share that format.
  // The bloom content layers gate on `state.gpu.bloomPyramid !== null`; the
  // `settings.bloom.enabled` master toggle gates at frame-program build.
  state.gpu.bloomPyramid = createBloomPyramid(device, 'rgba16float');

  // ── GPU timing service ────────────────────────────────────────────
  //
  // Always-constructed: the factory returns a no-op stub when neither
  // `?gpuTimings` nor `?perf` is set, OR the adapter lacks `timestamp-query`,
  // so consumers gate behind one `state.gpu.timingService.enabled` check.  The
  // no-op path allocates no GPU resources.
  state.gpu.timingService = createGpuTimingService(
    device,
    hasUrlGate('gpuTimings') || isPerfMode(),
    TIMED_SLOTS,
  );

  // ── Foreground / anchor renderers (Plans 01+02 — zoom-to-Earth) ──────
  //
  // The sphere-body renderers draw into the `foreground:0` render-target
  // row, so their ('rgba16float', 'depth32float') pipeline formats MUST
  // match that row's `format` / `depth` in `renderTargets.ts` — the
  // target↔renderer-profile invariant.  Nothing is imported from
  // renderTargets to enforce it: the formats are matched by convention +
  // this comment, exactly like the bare 'rgba16float' literal every other
  // HDR-target renderer above passes.
  //
  // starRenderer draws the resolved-partition stars (the Sun + any star
  // crossing STAR_RESOLVE_PX — see partitionStarsByResolution).  ONE
  // planetRenderer draws every seeded planet in a single
  // instanced draw: each body's MVP + albedo rides in a per-instance vertex
  // record (planetsLayer packs the batch), so the matrices survive to submit
  // without a per-body bind or a mid-frame uniform.
  state.gpu.starRenderer = createStarRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
  );
  state.gpu.planetRenderer = createPlanetRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // starPointRenderer draws the unresolved-partition stars as additive
  // points into the depthless HDR target — no depth format, unlike the
  // sphere factories above (the hdr row has no depth attachment).  The
  // camera-free seed uploaded here is the FULL star list: the camera boots
  // at galaxy scale, where partitionStarsByResolution classifies every star
  // (the Sun included) as a sub-pixel point, so the whole seed IS the boot
  // partition. It only covers the window before the first frame — from the
  // first draw on, starPointsLayer owns the point-set membership via the
  // partition and re-uploads per frame.
  //
  // Positions come from the fixed-epoch body snapshot, the construction-time
  // twin of the per-frame `sceneBodyStates` seam the layer reads: a star is a
  // static anchor, so the epoch cannot move it.
  const bootBodyStates = deriveBodyStates(CONST_J2000);
  state.gpu.starPointRenderer = createStarPointRenderer(device, 'rgba16float');
  state.gpu.starPointRenderer.setStars(
    state.data.bodies.stars.map((star) => ({
      ...star,
      positionMpc: bootBodyStates.get(star.id)!.positionMpc,
    })),
  );

  // bodyGlintRenderer draws the sub-pixel scene bodies (the glints branch of the
  // body partition) as brightness-scaled additive points into the same depthless
  // HDR target — no depth format, like starPointRenderer above. The close
  // sibling of starPointRenderer (kept a separate pipeline by design, spec §14).
  // No construction-time data delivery: bodyGlintsLayer recomputes every glint's
  // brightness + camera-relative anchor per frame and hands the whole batch to
  // draw, so the renderer stays a dumb pipeline with nothing to seed.
  state.gpu.bodyGlintRenderer = createBodyGlintRenderer(device, 'rgba16float');

  // starCatalogRenderer draws the survey (Gaia bin) stars — the wide-field
  // twin of starPointRenderer — as additive points into the same depthless
  // HDR target (no depth format).  It owns only the pipeline here; the star
  // layer uploads each catalog's records once as the .bin lands and walks the
  // octree per frame.  Constructed unconditionally (the pipeline is cheap);
  // stays a no-op draw until a catalog is uploaded.
  state.gpu.starCatalogRenderer = createStarCatalogRenderer(device, 'rgba16float');

  // starCatalogPickRenderer is the pick twin — it stamps a picked survey star's
  // identity into the pick program's r32uint pass. Constructed right after the
  // visual star renderer because it borrows that renderer's exposed BGLs +
  // per-source records bind group (`pickResources()`) so its own pick pipeline
  // stays bind-group compatible; it owns only its `pickPass = 1` uniform + per-
  // source node-params/prefix buffers. The star layer's `drawPick` row (Task 7)
  // drives it; a no-op draw until a catalog is uploaded.
  state.gpu.starCatalogPickRenderer = createStarCatalogPickRenderer(
    device,
    state.gpu.starCatalogRenderer.pickResources(),
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // bodyPickRenderer is the pick provider for the NEAR0 foreground bodies (Earth
  // + planets + the seeded scene stars). Constructed here alongside
  // `starCatalogPickRenderer` (both are `initGpu`-built pick providers, mirroring
  // `milkyWayPickRenderer` — NOT wired in `wireInput`); it owns its OWN sphere
  // mesh + dynamic-offset uniform (the per-draw slot that sidesteps the
  // writeBuffer/submit race) + point instance buffer, so it needs no other
  // renderer's resources. The body layers' `drawPick` rows (Task 11) drive it; a
  // no-op until a pick pass records into it.
  state.gpu.bodyPickRenderer = createBodyPickRenderer(device, SLAB_REVERSED_Z[NEAR0]!);

  // orbitTrailRenderer draws the accurate Keplerian orbit trails (Earth /
  // Jupiter / Moon) as additive screen-space conics into the same depthless
  // HDR target — no depth format, like starPointRenderer above.  Unlike the
  // stars, no bootstrap data-delivery step: orbitTrailsLayer derives the conic
  // geometry per frame from the current body snapshot and packs it itself.
  state.gpu.orbitTrailRenderer = createOrbitTrailRenderer(device, 'rgba16float');

  // ── Earth (Plan 02 — zoom-to-Earth) ──────────────────────────────────
  //
  // The textured landing target of the descent.  Its ('rgba16float',
  // 'depth32float') pipeline formats MUST match the `foreground:0` row's
  // `format` / `depth` in `renderTargets.ts` — the same target↔renderer-
  // profile invariant the sphere bodies above carry, matched by convention
  // + this comment rather than an import.
  state.gpu.earthRenderer = createEarthRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // ── Textured bodies (Plan 02 — the twelve non-Earth textured bodies) ─
  //
  // One shared UV-sphere pipeline draws the seven other major planets, the Moon,
  // and the four Galilean moons; each body id owns its own uniform buffer + bind
  // group + surface texture inside the renderer's per-body Map. Same
  // ('rgba16float', 'depth32float') `foreground:0` format invariant as the Earth
  // + sphere-body renderers above. The bodyTextures slot family (minted just
  // below) routes each non-Earth body's committed bitmap to `setMap` and its
  // per-kind eviction to `clearMap`.
  state.gpu.texturedBodyRenderer = createTexturedBodyRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // ── Saturn's rings (Plan 02 — the translucent overlay half) ──────────
  //
  // The ring renderer draws the annulus itself (the ring-on-planet shadow half
  // rides `texturedBodyRenderer`). Its pipeline bakes the `foreground:0` format
  // invariant AND the ring-specific profile: straight-alpha OVER, two-sided
  // (`cullMode: 'none'`), depth-tested but no depth write — so it overlays the
  // opaque spheres already in the target. The `saturn-ring` bodyTextures slot
  // (minted just below) routes the radial strip to `setTexture`.
  state.gpu.ringRenderer = createRingRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // ── Earth's cloud shell (Plan D — the translucent deck above the surface) ──
  //
  // The shell renderer draws the thin translucent sphere of clouds just above the
  // opaque globe, immediately after `earthLayer` in the (foreground:0, NEAR0)
  // group. Its pipeline bakes the `foreground:0` format invariant AND the shell
  // profile: straight-alpha OVER, back-culled closed sphere, depth-tested but no
  // depth write — so it overlays the opaque surface already in the target. The
  // `earth:clouds` bodyTextures slot routes the cloud map to `setTexture`; until
  // then a 1×1 transparent placeholder keeps the shell invisible.
  state.gpu.cloudShellRenderer = createCloudShellRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
  );

  // ── Earth's atmosphere shell (Plan E — the in-scatter halo) ──────────
  //
  // The atmosphere renderer draws the translucent proxy sphere at the
  // atmosphere-top radius, LAST in the (foreground:0, NEAR0) group. Its pipeline
  // bakes the `foreground:0` format invariant AND the shell profile: straight-alpha
  // OVER, two-sided (`cullMode: 'none'`, the fragment splits duty by front_facing),
  // depth-tested but no depth write — so its limb passes over space and is occluded
  // over the opaque disc. It bakes ONE bundle per `ATMOSPHERE_PARAMS` row (Earth
  // + six planets) at construction — the view-independent transmittance + multi-scatter
  // LUTs — while each body's sky-view LUT is re-baked per frame by the
  // `atmosphereSkyView` compute step. The factory takes the whole table, so a
  // second atmosphere body is a new params row, no wiring change here.
  state.gpu.atmosphereShellRenderer = createAtmosphereShellRenderer(
    device,
    'rgba16float',
    'depth32float',
    SLAB_REVERSED_Z[NEAR0]!,
    ATMOSPHERE_PARAMS,
  );

  // ── Body-surface texture slot family ─────────────────────────────────
  //
  // One demand-gated asset slot per textured body + the Saturn ring, minted
  // here (after the body renderers exist — the commit uploads into them) just
  // like the per-source point slots. The Blue Marble texture that re-skins this
  // placeholder Earth is now key `'earth'` in that family, NOT a bespoke
  // fire-and-forget fetch: each surface is paid on proximity (per-body load
  // radius), and its lifecycle (abort on release, render wake on ready) is owned
  // by the slot machinery. Commit routes `'earth'` today; Plan 02 extends the
  // dispatch to the planet/moon/ring renderers.
  wireBodyTextureSlots(state);
}
