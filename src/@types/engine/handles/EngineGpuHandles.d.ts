/**
 * EngineGpuHandles — the GPU pipelines / targets sub-bag of the
 * canonical `EngineState`.
 *
 * ### Why these fields start as null
 *
 * `createEngine` returns its handle synchronously, but the actual GPU
 * pipelines need an async `requestAdapter()` → `requestDevice()` chain.
 * The engine threads this through an async IIFE that runs in the
 * background after the handle has already been returned, so for one or
 * two frames at startup these handles are unavailable.  Modelling them
 * as `T | null` (rather than non-null with a separate "ready" flag)
 * makes the consumer null-check honest — every site that touches a
 * pipeline has to acknowledge the not-yet-built case, instead of relying
 * on a single boolean that someone might forget to read.
 *
 * ### Lifecycle
 *
 *   1. Sub-bag constructed with every field = null.
 *   2. Async IIFE runs: each field gets assigned exactly once after
 *      `initGpu` resolves.
 *   3. `destroy()` releases each pipeline and resets the field back to
 *      null for symmetry — this matters when the React layer remounts
 *      the canvas (StrictMode, hot-reload) and a fresh `createEngine`
 *      runs against a stale state object would otherwise see "ready"
 *      handles pointing at destroyed GPU resources.
 *
 * **Every field on this bag shares the same lifecycle rule** — null
 * before bootstrap, non-null after `initGpu` resolves, released and
 * re-nulled by `destroy()`.  That symmetry is load-bearing: the
 * `texturedDiskRenderer` / `proceduralDiskRenderer` / `milkyWayCloudRenderer`
 * fields exist on this bag specifically so the `destroy()` chain has a
 * reachable reference to call `.destroy()` on — they are not consumed
 * via this bag at runtime (the frame loop receives them through
 * `RunFrameDeps`).  When adding a new GPU-resource-owning renderer, add
 * it here so the teardown path stays complete.
 *
 * Keeping the bag named lets the renderFrame helper accept just the GPU
 * bag rather than the whole `EngineState`.
 */

import type { PointRenderer } from '../../rendering/PointRenderer';
import type { RenderTargets } from '../../rendering/RenderTargets';
import type { PickRenderer } from '../../rendering/PickRenderer';
import type { PickProgram } from '../frame/PickProgram';
import type { MilkyWayPickRenderer } from '../../rendering/MilkyWayPickRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { ConstellationRenderer } from '../../rendering/ConstellationRenderer';
import type { LabelRenderer } from '../../rendering/LabelRenderer';
import type { MarkerLineRenderer } from '../../rendering/MarkerLineRenderer';
import type { DebugLineRenderer } from '../../rendering/DebugLineRenderer';
import type { SelectionRingRenderer } from '../../rendering/SelectionRingRenderer';
import type { StructureMarkerRenderer } from '../../rendering/StructureMarkerRenderer';
import type { VolumeFieldRenderer } from '../../rendering/VolumeFieldRenderer';
import type { FlowFieldRenderer } from '../../rendering/FlowFieldRenderer';
import type { AdditiveUpsample } from '../../rendering/AdditiveUpsample';
import type { StarAggregateUpsample } from '../../rendering/StarAggregateUpsample';
import type { BloomPyramid } from '../../rendering/BloomPyramid';
import type { PickDebugOverlay } from '../../rendering/PickDebugOverlay';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayCloud } from '../../galaxy/MilkyWayCloud';
import type { MilkyWayCloudRenderer } from '../../rendering/MilkyWayCloudRenderer';
import type { HorizonShellRenderer } from '../../rendering/HorizonShellRenderer';
import type { ZoneOfAvoidanceRenderer } from '../../rendering/ZoneOfAvoidanceRenderer';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { DiskRadiusRing } from '../../rendering/DiskRadiusRing';
import type { EarthRenderer } from '../../rendering/EarthRenderer';
import type { StarRenderer } from '../../rendering/StarRenderer';
import type { PlanetRenderer } from '../../rendering/PlanetRenderer';
import type { TexturedBodyRenderer } from '../../rendering/TexturedBodyRenderer';
import type { RingRenderer } from '../../rendering/RingRenderer';
import type { CloudShellRenderer } from '../../rendering/CloudShellRenderer';
import type { AtmosphereShellRenderer } from '../../rendering/AtmosphereShellRenderer';
import type { StarPointRenderer } from '../../rendering/StarPointRenderer';
import type { BodyGlintRenderer } from '../../rendering/BodyGlintRenderer';
import type { StarCatalogRenderer } from '../../rendering/StarCatalogRenderer';
import type { StarCatalogPickRenderer } from '../../rendering/StarCatalogPickRenderer';
import type { BodyPickRenderer } from '../../rendering/BodyPickRenderer';
import type { OrbitTrailRenderer } from '../../rendering/OrbitTrailRenderer';
import type { FadeUniformsBgl } from '../../rendering/FadeUniformsBgl';
import type { SourceUniformsBgl } from '../../rendering/SourceUniformsBgl';
import type { FocusUniformsBgl } from '../../rendering/FocusUniformsBgl';
import type { FocusUniformBuffer } from '../../rendering/FocusUniformBuffer';
import type { Compositor } from '../../rendering/Compositor';
import type { LoadedFontAtlases } from '../../rendering/LoadedFontAtlases';
import type { GpuContext } from '../../rendering/GpuContext';

export type EngineGpuHandles = {
  renderer: PointRenderer | null;
  pickRenderer: PickRenderer | null;
  /**
   * The parallel per-slab pick program over the content-layer registry.
   * Owns the hover / click / debug-overlay pick path: it filters the registry
   * by `drawPick` presence + `enabled`, re-rasterises each pickable slab into
   * its own r32uint target, reads back the cursor texel, and folds the results
   * near→far. Constructed in `wireInput` (alongside `pickRenderer`, from which
   * it borrows the point-pick draw provider) once the registry + GPU handles
   * exist; null until then. Destroyed in teardown alongside the other pick
   * providers — it owns per-slab pick + depth textures and staging buffers.
   */
  pickProgram: PickProgram | null;
  /**
   * Invisible, pick-only Milky-Way billboard.  Stamps the MW identity
   * into the r32uint pick texture so the galactic centre is clickable.
   * Constructed in `wireInput`; null until then.  Drawn by the Milky-Way
   * layer's own `drawPick` row in the content-layer registry, gated by the
   * layer's `enabled` predicate so it only stamps while the disk is on
   * screen.  Destroyed in teardown alongside the other pick providers.
   */
  milkyWayPickRenderer: MilkyWayPickRenderer | null;
  /**
   * Canonical FadeUniforms bind-group layout (@group(1)). Constructed
   * once in `initGpu` and shared by every renderer pipeline that fades.
   * Null until `initGpu` resolves; see EngineGpuHandles docblock on the
   * staged-construction pattern.
   */
  fadeBgl: FadeUniformsBgl | null;
  /**
   * Canonical SourceUniforms bind-group layout (@group(2), points
   * only). Constructed once in `initGpu` and shared between the
   * visual PointRenderer and the offscreen PickRenderer. Null until
   * `initGpu` resolves.
   */
  sourceBgl: SourceUniformsBgl | null;
  /**
   * Canonical FocusUniforms bind-group layout. Constructed once in
   * `initGpu` and shared by every pipeline that renders the cluster-focus
   * dim — points (@group(3)), the impostor disks (@group(1)), and the
   * pick pass. Null until `initGpu` resolves.
   */
  focusBgl: FocusUniformsBgl | null;
  /**
   * The single shared cluster-focus uniform (buffer + bind group + packer).
   * Only one structure is focused at a time, so one buffer serves the whole
   * engine: written once per frame in `renderFrame`, and its bind group —
   * built against `focusBgl` — is bound by every focus-aware pipeline at
   * its own group slot (a bind group is tied to a layout, not a group
   * number). The pick pass binds this same live buffer so non-members of a
   * focused structure are excluded from hit-testing. Null until `initGpu`
   * resolves; released and re-nulled by `destroy()`.
   */
  focusUniform: FocusUniformBuffer | null;
  /**
   * The offscreen render-target table — one owner for every offscreen
   * row's (`hdr`, `volume`, …) texture lifecycle, resized as a unit on
   * canvas resize.  See `services/gpu/renderTargets.ts` for the target
   * table + the per-row rationale (why the HDR offscreen exists, why the
   * volume row renders at 1/3 scale).
   */
  renderTargets: RenderTargets | null;
  /**
   * Unified 'merge offscreen texture into target' primitive — the single
   * pipeline cache every composite draw (tone-mapped HDR→swap, foreground
   * OVER, additive field→HDR) shares. Constructed once in `initGpu`
   * alongside the render targets; the blend→dstFormat mapping baked in
   * at construction is a constructor argument rather than a per-draw one
   * because a render-pass encoder cannot be queried for its own colour-
   * attachment format. Null until `initGpu` resolves; released and
   * re-nulled by `destroy()`, which must reach it because it owns the
   * cached pipelines' uniform buffers.
   */
  compositor: Compositor | null;
  /**
   * Cosmic-web filament-skeleton renderer.  Constructed unconditionally
   * during GPU init (the pipeline is cheap), stays empty-segment until
   * the optional `loadFilaments()` resolves with a non-null cloud.
   * Stored on the GPU bag so `destroy()` can release the per-instance
   * buffer + uniform buffer + quad VBO without needing the construction-
   * time closure to outlive the public handle.
   */
  filamentRenderer: FilamentRenderer | null;
  /**
   * True-3D constellation stick-figure renderer. Constructed unconditionally
   * during GPU init (the pipeline is cheap), stays empty until the
   * `constellations` slot's commit uploads the ready `constellations.json`
   * artifact once on artifact-ready (flipping `hasData()` true and kicking the
   * demand-loaded fade); the pass thereafter only draws. Nullable + excluded
   * from `isEngineReady`, same rationale as `filamentRenderer`: the overlay is
   * an optional demand-loaded asset the `constellationsLayer` null-checks at
   * point of use.
   */
  constellationRenderer: ConstellationRenderer | null;
  /**
   * The decoded MSDF font atlas (BMFont JSON + bitmap), retained here (not a
   * local in `initGpu`) so `buildSwapRenderers` can re-run the label
   * factories on a swap-format rebuild without re-fetching. Null until
   * `initGpu` resolves the fetch; never released by `destroy()` — decoded
   * data, not a GPU resource.
   */
  fontAtlases: LoadedFontAtlases | null;
  /**
   * `device` + `context` + `canvas` for every renderer that targets the swap
   * chain, retained here for the same reason as `fontAtlases`:
   * `buildSwapRenderers` rebuilds those renderers from it on a format swap.
   * Omits `format` (unlike `GpuContext`) because that's the one field that
   * goes stale the instant a rebuild starts: `initGpu` constructs this field
   * from its own format-less object literal (not the full `GpuContext` it
   * builds for other constructors), so no stale format exists to leak, and
   * `buildSwapRenderers` composes `{ ...uiCtx, format }` with the live value.
   * Null until `initGpu` constructs it; never released by `destroy()` — no
   * GPU resource of its own.
   */
  uiCtx: Omit<GpuContext, 'format'> | null;
  /**
   * MSDF text label renderer.  Null until `initGpu` completes the
   * `loadFontAtlas()` fetch and constructs the renderer against the
   * decoded atlas bitmap.  Excluded from the `isEngineReady` predicate
   * — same rationale as `filamentRenderer`: the atlas load is async and
   * optional from the engine's perspective; the `labelsLayer` null-checks
   * this field at point of use.  Stored here so `destroy()` can release
   * the GPU buffers (uniform + storage + instance + corner + atlas texture).
   */
  labelRenderer: LabelRenderer | null;
  /**
   * Second MSDF label renderer for the true-scale foreground bodies
   * (zoom-to-Earth).  Separate from `labelRenderer` because the scene-body
   * captions project through the NEAR0 slab view — whose near plane scales
   * with `cam.distance` so it always contains the bodies — rather than the
   * galaxy-scale `vp` the main labels use, and one renderer draws with one
   * view-projection.  Seeded at construction with the `sceneBodyLabels(<body
   * snapshot>)` caption set (Earth, the local star map, the planets), which
   * `foregroundLabelsLayer` then re-uploads camera-relative each frame.  Null until
   * `initGpu` builds it against the font atlas; excluded from
   * `isEngineReady` and null-checked at use, like `labelRenderer`.
   * Released and re-nulled by `destroy()`.
   */
  foregroundLabelRenderer: LabelRenderer | null;
  /**
   * Second thick screen-space line renderer, the leader-line sibling of
   * `foregroundLabelRenderer`.  A SEPARATE instance from `markerLineRenderer`
   * for the same reason `foregroundLabelRenderer` is separate from
   * `labelRenderer`: the scene-body leader lines project through the NEAR0
   * slab (whose near plane scales with `cam.distance` so it always contains
   * the AU-scale bodies), while `markerLineRenderer`'s director-driven lines
   * project through the galaxy-scale COSMO `vp` that would clip the bodies
   * away — and one renderer draws with one view-projection.  Drawn by
   * `foregroundLabelsLayer`, which rebases its connectors into the
   * camera-relative frame each frame exactly as it rebases the captions.
   * Null until `initGpu` builds it (same UI ctx / swap-chain format as the
   * caption renderer, no atlas dep); excluded from `isEngineReady` and
   * null-checked at use.  Released and re-nulled by `destroy()`.
   */
  foregroundMarkerLineRenderer: MarkerLineRenderer | null;
  /**
   * Thick screen-space line overlay renderer.  Null until `initGpu`
   * constructs it alongside `labelRenderer` (same phase, no atlas dep).
   * Excluded from the `isEngineReady` predicate for the same reason as
   * `labelRenderer`.  The `markerLinesLayer` null-checks this field at
   * point of use.  Stored here so `destroy()` can release the GPU
   * buffers (uniform + instance + corner).
   */
  markerLineRenderer: MarkerLineRenderer | null;
  /**
   * Dedicated debug-draw thick-line renderer — the substrate for the clip-path
   * inspector overlay (speed-coloured route + scrub gizmo). Constructed
   * alongside `markerLineRenderer` (same UI ctx, swap-chain format, no atlas
   * dep), but decoupled from the label director: the `clipPathDebugLayer`
   * null-checks it and feeds it a freshly built `DebugLine[]` each frame.
   * Excluded from `isEngineReady`. Stored here so `destroy()` releases its GPU
   * buffers (uniform + instance + corner).
   */
  debugLineRenderer: DebugLineRenderer | null;
  /**
   * Selection-ring overlay renderer — draws a white annulus around the
   * currently-selected galaxy on the swap-chain UI overlay. Null until
   * `initGpu` constructs it; `selectionRingLayer` null-checks at point
   * of use. Stored here so `destroy()` can release the renderer's
   * two uniform buffers and bind group.
   */
  selectionRingRenderer: SelectionRingRenderer | null;
  /**
   * Structure-marker renderer — draws halo + ring overlays for every
   * structure category (cluster / supercluster / void / group; per-source
   * bind groups live inside the renderer).  Null until `initGpu` constructs it.
   * Excluded from the `isEngineReady` predicate for the same reason as
   * `markerLineRenderer` — null-checked at point of use by the
   * structure-marker frame pass.  Stored here so `destroy()` can release
   * the renderer's GPU buffers (per-category bind groups + per-instance
   * buffer + corner VBO).
   */
  structureMarkerRenderer: StructureMarkerRenderer | null;
  /**
   * Atlas-bound 3D-oriented disk renderer for large galaxy thumbnails
   * (close-approach view).  Null until `initGpu` constructs it from a
   * `GpuContext` snapshot.  Stored here so `destroy()` can release the
   * renderer's GPU buffers (uniform + per-instance + corner).
   *
   * Excluded from `isEngineReady` — it's set during `initGpu` (well
   * before `wireSlots`/`wireInput`), and adding fields to that predicate
   * is a lifecycle hazard: bootstrap progression isn't the inverse of
   * teardown.  Read sites that run during bootstrap null-check this
   * field individually.
   */
  texturedDiskRenderer: TexturedDiskRenderer | null;
  /**
   * Procedural-disk renderer that bridges the visibility band between
   * point glow (~8 px) and textured disks (~24 px).  Same lifecycle,
   * same reachability rationale, and same isEngineReady exclusion as
   * `texturedDiskRenderer` above.
   */
  proceduralDiskRenderer: ProceduralDiskRenderer | null;
  /**
   * GPU-generated Milky-Way star+dust point cloud — the buffer resource
   * (per-tier star/dust instance buffers + regenerate/destroy) that the
   * `milkyWayCloudRenderer` draws.  Null until `initGpu` generates the first
   * tier's cloud; regenerated in `makeRunTierTransition` on a tier swap.
   * Same lifecycle + isEngineReady exclusion as the other optional GPU
   * resources; stored here so `destroy()` can release the star/dust vertex
   * buffers + the reused generation UBO.
   */
  milkyWayCloud: MilkyWayCloud | null;
  /**
   * The two-pass (additive stars + multiplicative dust) renderer that draws
   * `milkyWayCloud` on the HDR path.  Null until `initGpu` constructs it;
   * `milkyWayLayer` reads it off `state.gpu.*` at draw time.  Stored here
   * so `destroy()` can release its shared uniform + corner-quad buffers.
   * Excluded from `isEngineReady` (same rationale as the other optional
   * renderers).
   */
  milkyWayCloudRenderer: MilkyWayCloudRenderer | null;
  /**
   * Cosmic-horizon shell renderer — translucent sphere at the
   * comoving particle-horizon radius.  Same lifecycle as the other
   * optional renderers (null until `initGpu` constructs it; nulled
   * back out during teardown).
   */
  horizonShellRenderer: HorizonShellRenderer | null;
  /**
   * Galactic-plane dust-band guide overlay — translucent shell masked to
   * the longitude-dependent latitude wedge, drawn by the same ray-marched-
   * geometry technique as `horizonShellRenderer`.  Same lifecycle as the
   * other optional renderers (null until `initGpu` constructs it; nulled
   * back out during teardown).
   */
  zoneOfAvoidanceRenderer: ZoneOfAvoidanceRenderer | null;
  /**
   * Multi-field 3D scalar-field volume renderer.  Null until `initGpu`
   * constructs it (same phase as the other optional renderers).
   * Excluded from the `isEngineReady` predicate — the renderer is
   * optional at runtime; the `volumeUpsampleLayer.enabled` gate checks
   * the master `volumesEnabled` setting first and then consults
   * `hasActiveFields()`, so a null handle (pre-bootstrap or destroyed)
   * is silently a no-op.  Stored here so `destroy()` can release every
   * per-field GPU buffer (3D volume textures, palette LUTs, uniform
   * buffers, corner / index VBOs).
   */
  volumeFieldRenderer: VolumeFieldRenderer | null;
  /**
   * CF4++ peculiar-velocity flow-field renderer — the engine's first compute
   * renderer. Null until `initGpu` constructs it (same phase as the other
   * optional renderers). Excluded from the `isEngineReady` predicate: the layer
   * is default-off and demand-loaded, and `encodeFlowCompute` / `flowFieldLayer`
   * null-check the handle alongside the `settings.flow.enabled` +
   * `slotReady(assetSlots.flow)` gate, so a null handle is a silent no-op. Stored here so
   * `destroy()` can release the particle buffers, the three compute pipelines,
   * the ribbon pipeline, and the velocity texture.
   */
  flowFieldRenderer: FlowFieldRenderer | null;
  /**
   * Half-res-to-HDR volume upsample pass.  Null until `initGpu`
   * constructs it (same phase as the other optional renderers).
   * Excluded from the `isEngineReady` predicate — when null, the
   * `volumeUpsampleLayer` skips its draw (so a null handle is a silent
   * no-op).  Stored here so `destroy()` can release the pipeline +
   * sampler + bind-group-layout.
   */
  volumeUpsample: AdditiveUpsample | null;
  /**
   * Reduced-res-to-HDR composite for the Milky Way cloud's star field. Reads
   * the `mw-aggregate` offscreen that `milkyWayAggregateLayer` drew the
   * additive star billboards into and blends it into HDR. A SECOND instance of
   * the (fully generic) volume-upsample factory, deliberately not the volume's
   * own handle, so the two subsystems' gates stay independent. Null until
   * `initGpu` constructs it (same phase as `volumeUpsample`). Excluded from
   * `isEngineReady` — when null, `milkyWayUpsampleLayer` skips its draw, so a
   * null handle is a silent no-op. Stored here so `destroy()` can release the
   * pipeline + sampler + bind-group-layout via the pass's no-op destroy method.
   */
  milkyWayAggregateUpsample: AdditiveUpsample | null;
  /**
   * Half-res-to-HDR survey-star aggregate upsample composite. Reads the
   * `star-aggregates` offscreen the aggregate stream drew LINEAR into,
   * re-applies the star pass's hue-preserving knee to the summed field, and
   * additively blends the result into HDR (the LOD-symmetry fix). Null until
   * `initGpu` constructs it (same phase as `volumeUpsample`). Excluded from
   * `isEngineReady` — when null, `starAggregateUpsampleLayer` skips its draw, so
   * a null handle is a silent no-op. Stored here so `destroy()` can release the
   * pipeline + sampler + bind-group-layout via the pass's no-op destroy method.
   */
  starAggregateUpsample: StarAggregateUpsample | null;
  /**
   * Dual-filter bloom mip pyramid — owns the bright / downsample / upsample /
   * fold pipelines that drive the `bloom0..bloom4` render-target rows and the
   * strength-scaled fold back into HDR. Null until `initGpu` constructs it
   * (same phase as `volumeUpsample` / `starAggregateUpsample`). Excluded from
   * `isEngineReady` — every bloom content layer's `enabled` gate is exactly the
   * `bloomPyramid !== null` handle-ready check, so a null handle silently drops
   * the whole bloom sub-program. The `settings.bloom.enabled` toggle gates at
   * frame-program build, not here. Stored so `destroy()` can release the small
   * per-level + fold uniform buffers.
   */
  bloomPyramid: BloomPyramid | null;
  /**
   * Pick-buffer debug overlay — fullscreen colour-map of the r32uint
   * pick texture over the tone-mapped frame.  Null until `initGpu`
   * constructs it.  Excluded from `isEngineReady`: it's a debug-only
   * pass, and the per-frame consumer null-checks the field along with
   * the `state.settings.debug.showPickBuffer` toggle.  Stored here so
   * `destroy()` can release the pipeline + bind-group-layout via the
   * pass's no-op destroy method (symmetry with the other GPU-resource
   * owners).
   */
  pickDebugOverlay: PickDebugOverlay | null;
  /**
   * Disk-radius debug ring — a world-space line-strip drawn in the disk
   * plane around the selected galaxy at its catalog disk radius.  Null
   * until `initGpu` constructs it.  Excluded from `isEngineReady`: a
   * debug-only overlay, null-checked together with the
   * `state.settings.debug.showDiskRadiusRing` toggle.  Unlike
   * `pickDebugOverlay` (which owns no GPU buffers), this pass owns two
   * uniform buffers, so the `destroy()` chain must release it.
   */
  diskRadiusRing: DiskRadiusRing | null;
  /**
   * True-scale, Blue-Marble-textured Earth drawn into the `foreground:0`
   * render-target row (Plan 02 — zoom-to-Earth).  Same UV-sphere mesh as the
   * star/planet renderers below, but shaded by sampling an equirectangular
   * Blue Marble bitmap. Its ('rgba16float', 'depth32float') pipeline formats
   * MUST match that row's `format` / `depth` in `renderTargets.ts` — the
   * target↔renderer-profile invariant. Constructed in `initGpu`, which also
   * mints its surface texture into the `bodyTextures` slot family (key
   * `'earth'`); that slot is proximity-demanded on descent and its commit calls
   * `setTexture`. Until the bitmap lands the renderer draws a plain mid-blue
   * placeholder sphere.  Excluded
   * from `isEngineReady` and null-checked at use by `earthLayer`.  Null until
   * `initGpu` constructs it; released and re-nulled by `destroy()` (releases
   * the position + uv VBOs, index IBO, uniform buffer, and the Earth texture).
   */
  earthRenderer: EarthRenderer | null;
  /**
   * Flat-emissive resolved stars (the `spheres` branch of
   * `partitionStarsByResolution` — any star whose apparent size crosses
   * `STAR_RESOLVE_PX`, the Sun included) drawn into the `foreground:0`
   * render-target row.  Same ('rgba16float', 'depth32float') format
   * invariant as `earthRenderer`.  Owns a single non-dynamic uniform
   * buffer, so same-frame draws through it clobber each other's uniforms
   * (last write wins) — a known gap should two stars ever resolve at once;
   * see `starSpheresLayer`'s module header for why the case is out of
   * reach today and what the real fix is.
   * Excluded from `isEngineReady` and null-checked at use.  Null until
   * `initGpu` constructs it; released and re-nulled by `destroy()`.
   */
  starRenderer: StarRenderer | null;
  /**
   * Flat-lit albedo planets — a SINGLE renderer instance that draws every
   * seeded planet in one frame via GPU instancing: `planetsLayer` packs each
   * body's MVP + albedo into a per-instance vertex-buffer record and hands
   * the whole batch to one `draw` call, which does one `queue.writeBuffer`
   * followed by one instanced `drawIndexed`. Each instance reads its OWN
   * baked record, so there is no shared per-draw uniform for a later write
   * to clobber (the writeBuffer-vs-submit landmine that a dynamic-offset or
   * shared-slot design would have to guard against). Same `foreground:0`
   * format invariant as the other sphere bodies. Excluded from
   * `isEngineReady` and null-checked at use. Null until `initGpu` constructs
   * it; released and re-nulled by `destroy()`.
   */
  planetRenderer: PlanetRenderer | null;
  /**
   * The shared textured-sphere renderer for the twelve non-Earth textured
   * bodies (the seven other major planets, the Moon, and the four Galilean
   * moons) — one UV-sphere pipeline whose per-body `Map` gives each body its
   * own uniform buffer + bind group + surface texture, so no shared uniform can
   * be clobbered mid-frame. `texturedBodiesLayer` draws the `textured` branch of
   * `partitionBodiesByPresentation` through it; the `bodyTextures` slot family's
   * commit routes each non-Earth body's bitmap to `setMap`, and its per-kind
   * onRelease frees that (body, kind)'s texture via `clearMap`. Same `foreground:0`
   * ('rgba16float', 'depth32float') format invariant as `earthRenderer` /
   * `planetRenderer`. Excluded from `isEngineReady` and null-checked at use.
   * Null until `initGpu` constructs it; released and re-nulled by `destroy()`
   * (which also frees every per-body uniform buffer + surface/ring texture).
   */
  texturedBodyRenderer: TexturedBodyRenderer | null;
  /**
   * The translucent planetary-ring renderer (Saturn's rings) — the overlay half
   * of the ring system, drawn LAST in the `(foreground:0, NEAR0)` group as a
   * two-sided translucent annulus that depth-tests against the opaque spheres
   * but writes no depth and blends straight-alpha OVER. Its ('rgba16float',
   * 'depth32float') pipeline formats match the `foreground:0` row like the sphere
   * bodies. `ringsLayer` draws each resident `SCENE_RINGS` entry through it; the
   * `bodyTextures` family's `saturn-ring` commit routes the radial strip to
   * `setTexture` (alongside `texturedBodyRenderer.setRingTexture` for the
   * ring-on-planet shadow half). Excluded from `isEngineReady` and null-checked
   * at use. Null until `initGpu` constructs it; released and re-nulled by
   * `destroy()` (releases the disc VBO/IBO, uniform buffer, and strip texture).
   */
  ringRenderer: RingRenderer | null;
  /**
   * The body-agnostic translucent cloud shell (Earth today; Venus / Titan opt in
   * later) — a thin closed sphere drawn just ABOVE the opaque surface in the
   * `(foreground:0, NEAR0)` group, immediately after `earthLayer`. Its
   * ('rgba16float', 'depth32float') pipeline formats match the `foreground:0` row
   * like the sphere bodies; it depth-tests against the opaque globe but writes no
   * depth and blends straight-alpha OVER — the same profile as `ringRenderer`.
   * `cloudShellLayer` draws it once per frame; the `bodyTextures` family's
   * `earth:clouds` commit routes the cloud colour+coverage map to `setTexture`.
   * Until that lands, a 1×1 transparent placeholder keeps the shell invisible.
   * Excluded from `isEngineReady` and null-checked at use. Null until `initGpu`
   * constructs it; released and re-nulled by `destroy()` (releases the position +
   * uv VBOs, index IBO, uniform buffer, and the cloud texture).
   */
  cloudShellRenderer: CloudShellRenderer | null;
  /**
   * Earth's physically-based in-scatter atmosphere (Earth today; Mars / Venus /
   * Titan opt in later via their own `ATMOSPHERE_PARAMS` rows + renderer
   * instances) — the LAST `(foreground:0, NEAR0)` row, a translucent proxy sphere
   * at the atmosphere-top radius drawn AFTER every opaque sphere and the
   * rings/cloud-shell, depth-tested against them but writing no depth and blending
   * straight-alpha OVER — the same profile as `ringRenderer` / `cloudShellRenderer`.
   * Its ('rgba16float', 'depth32float') pipeline formats match the `foreground:0`
   * row. It owns three LUT textures (transmittance + multi-scatter baked once at
   * construction, sky-view re-baked each frame by the `atmosphereSkyView` compute
   * step). `atmosphereShellLayer` draws it once per frame; it is non-pickable
   * (a translucent halo has no clickable silhouette). Excluded from `isEngineReady`
   * and null-checked at use. Null until `initGpu` constructs it; released and
   * re-nulled by `destroy()` (releases the three LUTs + their pipelines, the proxy
   * sphere geometry, the shell pipeline, and the three uniform buffers).
   */
  atmosphereShellRenderer: AtmosphereShellRenderer | null;
  /**
   * The unresolved stars (the `points` branch of
   * `partitionStarsByResolution`) as additive point sprites into the
   * depthless HDR target — the far half of the star LOD (`star-points`
   * layer, drawn by the frame program's dedicated `(hdr, NEAR0)` render
   * step).  No depth format: the hdr row has no depth attachment.  Star
   * instances are seeded in `initGpu` via `setStars` (the full star list —
   * at the galaxy-scale boot camera every star is a sub-pixel point) and
   * re-uploaded by `starPointsLayer` per frame from the
   * apparent-size partition.  Excluded from
   * `isEngineReady` and null-checked at use.  Null until `initGpu`
   * constructs it; released and re-nulled by `destroy()` (releases the
   * instance + uniform buffers).
   */
  starPointRenderer: StarPointRenderer | null;
  /**
   * The sub-pixel scene bodies (the `glints` branch of
   * `partitionBodiesByPresentation`) as brightness-scaled additive point sprites
   * into the depthless HDR target — the far half of the body LOD (`body-glints`
   * layer, sharing the frame program's `(hdr, NEAR0)` render step with
   * `star-points`).  Its brightness encodes apparent size x albedo x phase, and
   * cross-fades with the resolved mesh over 1-3 px so bodies stop popping in/out
   * on descent.  The close sibling of `starPointRenderer` — a separate renderer
   * for this feature by design (the fold candidate is deferred, spec §14).  No
   * depth format: the hdr row has no depth attachment.  Needs no data-delivery
   * step: `bodyGlintsLayer` packs and hands the whole batch every frame.
   * Excluded from `isEngineReady` and null-checked at use.  Null until `initGpu`
   * constructs it; released and re-nulled by `destroy()` (releases the instance +
   * uniform buffers).
   */
  bodyGlintRenderer: BodyGlintRenderer | null;
  /**
   * The survey (Gaia bin) stars as additive point sprites into the depthless
   * HDR target — the wide-field twin of `starPointRenderer`, fed from an
   * in-file octree of cell-quantized records rather than a flat seed list.
   * Records upload once per source (`upload`); the star layer walks each
   * octree per frame (`loadedCatalogs`) and draws the per-frame cut.  No depth
   * format: the hdr row has no depth attachment.  Excluded from
   * `isEngineReady` and null-checked at use.  Null until `initGpu` constructs
   * it; released and re-nulled by `destroy()` (releases the per-source records
   * + node-params buffers and the shared camera uniform).
   */
  starCatalogRenderer: StarCatalogRenderer | null;
  /**
   * The r32uint pick provider for the survey (Gaia bin) stars — the pick twin
   * of `starCatalogRenderer`, making a catalogued star clickable.  Records one
   * source's leaf cut into the pick program's r32uint pass, stamping the picked
   * star's packed identity.  Shares the visual renderer's records bind group
   * (via its `pickResources()`) but owns its own `pickPass = 1` uniform + per-
   * source node-params/prefix buffers (the writeBuffer/submit ordering fix).
   * Depth-tested so the nearest star wins the pixel, unlike the depthless
   * additive visual star pass.  Constructed in `initGpu` right after
   * `starCatalogRenderer` (it depends on that renderer's exposed BGLs); null
   * until then.  Excluded from `isEngineReady` and null-checked at use.  Released
   * and re-nulled by `destroy()` (its own uniform + per-source pick buffers; the
   * shared records buffers belong to the visual renderer).
   */
  starCatalogPickRenderer: StarCatalogPickRenderer | null;
  /**
   * The r32uint pick provider for the NEAR0 foreground bodies (Earth, the
   * planets, and the ~25 seeded scene stars incl. the Sun) — the body-family
   * analogue of `starCatalogPickRenderer`.  Records ONE body sphere per
   * `drawSphere` call (via a 256-byte-aligned dynamic-offset uniform whose
   * per-pass cursor sidesteps the writeBuffer/submit race) and the sub-pixel
   * scene-star POINT partition as one instanced pick-billboard draw.  Depth-
   * tested (`depth32float`, 'less') so overlapping bodies resolve nearest-wins.
   * Constructed in `initGpu` alongside `starCatalogPickRenderer`; the body
   * layers' `drawPick` rows (Task 11) drive it.  Excluded from `isEngineReady`
   * and null-checked at use.  Released and re-nulled by `destroy()` (its sphere
   * mesh VBO/IBO, the sphere dynamic-offset + point camera uniforms, and the
   * grow-only point instance buffer).
   */
  bodyPickRenderer: BodyPickRenderer | null;
  /**
   * The accurate Keplerian orbit trails (Earth / Jupiter around the Sun, the
   * Moon around Earth) as additive screen-space conics into the depthless HDR
   * target — the `orbit-trails` layer, sharing the frame program's
   * `(hdr, NEAR0)` render step with `star-points`.  No depth format: the hdr
   * row has no depth attachment.  ONE instanced draw paints every trail:
   * `orbitTrailsLayer` packs each orbit's f64-composed inverse homography
   * `Ginv` + trail params into a per-instance vertex record, so no per-orbit
   * bind or mid-frame uniform exists for the writeBuffer-vs-submit race to
   * clobber.  `orbitTrailsLayer` derives the conic geometry per frame from the
   * current body snapshot, so the renderer needs no bootstrap data delivery at
   * all.  Excluded from `isEngineReady` and null-checked at use.
   * Null until `initGpu` constructs it; released and re-nulled by `destroy()`
   * (releases the instance buffer).
   */
  orbitTrailRenderer: OrbitTrailRenderer | null;
  /**
   * Per-pass GPU timing service.  Always non-null — the engine state
   * is initialized with a no-op stub (see `createDisabledGpuTimingService`)
   * and `initGpu` replaces it with the device-aware service once the
   * GPU device is available.  Consumers gate work behind one check:
   * `if (state.gpu.timingService.enabled) { ... }`.
   *
   * `enabled` is true iff `?gpuTimings` is set AND the adapter
   * supports `timestamp-query`.  False covers both "user opted out"
   * and "feature missing"; the DebugPanel shows one combined
   * "unavailable" message in either case.
   *
   * No GPU resources are allocated in the disabled path, so always-
   * non-null carries no perf cost.
   */
  timingService: GpuTimingService;
};
