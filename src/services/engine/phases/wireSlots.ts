/**
 * wireSlots — bootstrap phase that wires sidecar asset slots, the
 * load-progress emitter, the thumbnail subsystem, and kicks off the
 * parallel multi-survey load.
 *
 * The 5 point-source slots are minted earlier (in `initGpu`, immediately
 * after the renderer that they commit into). This phase covers the rest:
 *
 *   - Filament, CF-4 DM density, MCPM Cosmic Web volume slots.
 *   - Famous-meta + PGC-alias sidecar slots.
 *   - Synthetic-volume DEV fixtures.
 *   - The `allSlots` registry + load-progress emitter.
 *   - The galaxy-atlas / textured-disk / procedural-disk subsystems.
 *
 * After mint, this phase fires `cb.onStatusChange({ kind: 'loading' })`
 * and kicks off the parallel survey loads. It does NOT block on arrivals
 * — `wireInput` and `startLoop` run immediately afterwards so the camera
 * and the rAF loop come up with whatever has landed (often nothing yet),
 * letting the Milky Way appear on the first frame and surveys fade in
 * progressively. Two background subscribers handle the rest:
 *
 *   1. Per-arrival `ready` status emission with running totals.
 *   2. Synthetic fallback when every real survey settles without a
 *      successful ready+count>0.
 *
 * ### State writes
 *
 *   - `state.assetSlots.filaments`, `state.assetSlots.famousMeta`,
 *     `state.assetSlots.pgcAlias`, `state.assetSlots.cf4Density`,
 *     `state.assetSlots.mcpm`, `state.assetSlots.syntheticVolumes`.
 *   - `state.sources.famousMeta`, `state.sources.famousXrefs` — via
 *     famous-meta subscriber (on `ready`).
 *   - `state.sources.catalogs` — populated by the per-source slot commit
 *     subscribers (wired in `initGpu`).
 *   - `state.subsystems.loadProgress`, `state.subsystems.galaxyAtlas`,
 *     `state.subsystems.texturedDisks`, `state.subsystems.proceduralDisks`.
 *   - `cb.onStatusChange({ kind: 'loading' })` synchronously; `kind:
 *     'ready'` fires from the per-arrival subscriber, not from this body.
 *
 * ### Side effects on `deps`
 *
 *   - Mutates `deps.allSlots` — populates with every minted slot.
 */

import { Source } from '../../../data/sources';
import { maskHas } from '../../../utils/sourceMask';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  SURVEY_POINT_SOURCES,
  TIER_FETCHED_POINT_SOURCES,
  loadCompanionAssets,
} from '../wiring/galaxyCatalogSourceRegistry';
import { buildPoisFromFamousMeta } from './buildPoisFromFamousMeta';
import { createFilamentSlot } from '../../loading/slots/filamentSlot';
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createFamousMetaSlot } from '../../loading/slots/famousMetaSlot';
import { createMilliquasNamesSlot } from '../../loading/slots/milliquasNamesSlot';
import { createPgcAliasSlot } from '../../loading/slots/pgcAliasSlot';
import { createSyntheticVolumeSlots } from '../../loading/slots/syntheticVolumeSlots';
import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { createGalaxyAtlasSubsystem } from '../subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../subsystems/proceduralDiskSubsystem';
import { createTexturedDiskSubsystem } from '../subsystems/texturedDiskSubsystem';
// Cosmography POI anchors wired unconditionally into the POI subsystem
// below — the user-facing toggle is the SettingsPanel per-category
// checkbox, not a URL gate.  (Pre-2026-05-17 this was gated on
// `?anchors=1`; see the inline rationale at the wire site.)
// Synthetic-volume imports that previously sat here
// (DEFAULT_VOLUME_FIELD_INTENSITY, getVolumeFieldDefaults,
// syntheticVolumeFetcher) were moved into `syntheticVolumeSlots.ts`
// by H4 and intentionally stay out.
import { buildStaticAnchorPois } from '../../../data/buildStaticAnchorPois';
import { DEFAULT_CF4_DENSITY_ENABLED } from '../../../data/defaults';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 2: sidecar slots + load-progress emitter + thumbnail
 * subsystem + parallel multi-survey load with synthetic fallback.
 */
export async function wireSlots(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { cb, allSlots } = deps;
  // `phaseLocals` is set by `initGpu`, which always runs before us per
  // the orchestrator's order.  The non-null assertion is therefore
  // safe; if `initGpu` ever stops setting it the orchestrator would
  // need updating in lockstep.
  const phaseLocals = deps.phaseLocals!;
  const { device } = phaseLocals;
  // Renderers are owned by `state.gpu.*` (written by `initGpu`).  Pre-M1
  // (2026-05-11 audit) we also kept them on `phaseLocals` and read
  // through there with a `!` bang — the bang was folklore that assumed
  // phase ordering.  The explicit null-checks below turn that assumption
  // into a typed runtime error if `initGpu` is ever skipped/reordered.
  const { texturedDiskRenderer, proceduralDiskRenderer } = state.gpu;
  if (texturedDiskRenderer === null || proceduralDiskRenderer === null) {
    throw new Error(
      'wireSlots: texturedDisk/proceduralDisk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // ── Filament asset slot (Task 9) ─────────────────────────────────
  // Factory owns the mint + subscribe + state write.  See
  // `loading/slots/filamentSlot.ts` for the lifecycle rationale.
  const filamentSlot = createFilamentSlot(state, cb);

  // ── Cosmography anchor POIs (always wired) ───────────────────────
  //
  // Pre-2026-05-17 this block was gated behind `?anchors=1`, intended
  // as a dev overlay for visually cross-referencing the CF-4 DM cube
  // alignment.  The cluster + void labels turned out to be useful as
  // a first-class production overlay (they help users orient against
  // known large-scale structure), so the gate is now removed.  The
  // SettingsPanel's per-category checkboxes (Overlays → Labels) are
  // the user-facing knob; this wire just makes the POIs available.
  //
  // The three lists stay separate (rather than one merged export) so
  // the audit script in `tools/` can consume CLUSTER_ANCHORS without
  // pulling in interpretive supercluster/void POIs.
  //
  // physicalRadiusMpc per anchor comes from clusterAnchors.ts —
  // literature-grounded values (R_200 / virial radii for clusters,
  // characteristic structural extent for superclusters and voids).
  // See the per-anchor citation comments in clusterAnchors.ts.
  //
  // The id-slug + worldPos build is factored into
  // `data/buildStaticAnchorPois.ts` so the React-side `usePoiUrlSync`
  // deep-link drain can construct the same `PointOfInterest` records
  // by id without drifting on slug-rule changes.
  const staticAnchorPois: PointOfInterest[] = buildStaticAnchorPois();
  state.subsystems.pois.setPois(staticAnchorPois);

  // ── CF-4 DM density volume slot ──────────────────────────────────
  // Slot minted unconditionally; the boot-time `.load()` below is
  // gated on `DEFAULT_CF4_DENSITY_ENABLED` so a default-off CF-4
  // doesn't waste bandwidth.  Toggling on later lazy-loads via
  // `engine.setVolumeFieldEnabled`.  Factory owns mint + commit + state
  // write — see `loading/slots/cf4DensitySlot.ts`.
  createCf4DensitySlot(state, cb);
  // MCPM Cosmic Web slot — minted here, but `.load()` deferred to the
  // central coordination point below alongside filaments / CF-4 /
  // point-source loads.  Loading inline at mint time fires too early
  // in bootstrap (renderer not yet wired, no loading-bar registry),
  // so the slot's commit is a silent no-op.  Same pattern as
  // cf4DensitySlot: factory writes `state.assetSlots.mcpm`, the
  // central `.load()` below picks it up and triggers the actual fetch.
  createMcpmSlot(state, cb);

  // ── Famous-galaxy sidecar slot (Task 10) ─────────────────────────
  // Factory owns the mint + subscribe + state write.  See
  // `loading/slots/famousMetaSlot.ts` for the dual-sidecar rationale and
  // the graceful-degradation policy on fetch error.
  const famousMetaSlot = createFamousMetaSlot(state, cb);

  // ── Famous-galaxy label wire (deferred merge) ────────────────────
  //
  // Famous POIs need two ingredients: the meta sidecar (for names +
  // diameter) and the Famous galaxy catalog (for worldPos).  Both arrive
  // asynchronously — `famousMetaSlot.load()` fires later in this phase;
  // the catalog arrives via the per-source slot commit that `initGpu`
  // already wired.  We re-run the merge whenever either ingredient
  // lands so the user sees labels appear as soon as the data is on
  // hand.
  //
  // Re-merging static anchors + Famous POIs every time isn't a
  // performance concern: setPois is O(N) over the merged list (~125
  // POIs at most), and produceLabels only forwards changes downstream
  // when the label set actually changes.  Simpler to recompute the
  // merged list than to track partial state.
  function rewireFamousPois(): void {
    const meta = state.sources.famousMeta;
    const catalog = state.sources.catalogs.get(Source.Famous);
    if (meta.length === 0 || catalog === undefined || catalog.count === 0) return;
    const famousPois = buildPoisFromFamousMeta(meta, catalog);
    state.subsystems.pois.setPois([...staticAnchorPois, ...famousPois]);
  }
  // Try immediately (in case both ingredients are already present —
  // possible when wireSlots is replayed in tests or after a hot reload).
  rewireFamousPois();
  // Subscribe to the famous-meta slot's transitions; the subscriber
  // also fires once with the current state, so a slot already in
  // `ready` state re-triggers the merge here.
  famousMetaSlot.subscribe((s) => {
    if (s.kind === 'ready') rewireFamousPois();
  });
  // Subscribe to the Famous catalog's slot for the symmetric trigger.
  const famousCatalogSlot = state.assetSlots.points.get(Source.Famous);
  if (famousCatalogSlot !== undefined) {
    famousCatalogSlot.subscribe((s) => {
      if (s.kind === 'ready') rewireFamousPois();
    });
  }

  // ── Milliquas names sidecar slot ─────────────────────────────────
  // Per-tier, lazy-by-tier: loaded at boot with the active tier, and
  // reloaded by `engine.setTier` when the user flips tiers.  Tiny JSON
  // (~10 MB at medium tier with 200k names + classes), so paying it
  // at boot keeps the first Milliquas hover already showing the
  // human-readable headline rather than the auto-generated IAU name.
  const milliquasNamesSlot = createMilliquasNamesSlot(state, cb);

  // ── PGC-alias slot (Task 10) ─────────────────────────────────────
  // Lazy: only `load()`-ed on first Cmd+K palette open via the public
  // handle's `loadPgcAliases()` shim.  Factory owns the mint + state
  // write; see `loading/slots/pgcAliasSlot.ts`.
  const pgcAliasSlot = createPgcAliasSlot(state, cb);

  // ── Synthetic volume slots (DEV-only) ────────────────────────────
  // Axis-verification debug fixtures — gated on DEV so production
  // users don't see synthetic noise.  Vite tree-shakes the factory
  // out of production bundles.
  if (import.meta.env.DEV) {
    createSyntheticVolumeSlots(state, cb);
  }

  // ── Loading-bar emitter ──────────────────────────────────────────
  //
  // Post-Task-12 the per-engine loading-bar aggregator is a thin
  // subscriber over `aggregateRegistry`.  Build the slot registry
  // here (now that every slot exists) and hand it to the emitter;
  // `attachSlot` then wires each slot's `subscribe` so that any
  // state transition recomputes the projection and forwards the
  // snapshot to `cb.onLoadProgress`.
  //
  // Why a single shared Map rather than four separate `attachSlot`
  // calls each owning their own subset?  The same registry also
  // feeds the dev panel's per-slot view (Task 13); building it
  // once here keeps both consumers in lock-step on what counts as
  // "in flight".
  //
  // The `unknown` type-erasure below is benign — `aggregateRegistry`
  // only reads `slot.state()` discriminator fields, never the
  // payload type.  We re-narrow at the dev panel's per-slot
  // rendering site if it cares.
  //
  // `allSlots` is declared at outer scope (top of `createEngine`) so
  // the public handle can expose the same Map as `assetSlots` for
  // the `LoadingDevPanel` debug component.  We populate it here once
  // every slot exists.
  for (const [, slot] of state.assetSlots.points) {
    allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
  }
  allSlots.set(filamentSlot.name, filamentSlot as unknown as AssetSlot<unknown, unknown>);
  allSlots.set(famousMetaSlot.name, famousMetaSlot as unknown as AssetSlot<unknown, unknown>);
  allSlots.set(
    milliquasNamesSlot.name,
    milliquasNamesSlot as unknown as AssetSlot<unknown, unknown>,
  );
  allSlots.set(pgcAliasSlot.name, pgcAliasSlot as unknown as AssetSlot<unknown, unknown>);
  if (state.assetSlots.cf4Density) {
    allSlots.set(
      state.assetSlots.cf4Density.name,
      state.assetSlots.cf4Density as unknown as AssetSlot<unknown, unknown>,
    );
  }
  // Register the synthetic volume slots only when they were minted (dev
  // builds).  Doing the registration here (after the DEV-guarded mint
  // block) keeps the `allSlots` population site cohesive with its
  // neighbours instead of scattering it into the DEV branch.
  if (state.assetSlots.syntheticVolumes) {
    for (const slot of Object.values(state.assetSlots.syntheticVolumes)) {
      allSlots.set(slot.name, slot as unknown as AssetSlot<unknown, unknown>);
    }
  }

  const progressEmitter = createLoadProgressEmitter((snapshot) => {
    cb.sources?.onLoadProgress?.(snapshot);
  }, allSlots);
  for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
  state.subsystems.loadProgress = progressEmitter;

  // famous-meta + xrefs are declared as Famous's `companions` in the
  // registry; they fire from the boot loop below alongside the
  // Famous bin. PGC-aliases stay lazy; see `loadPgcAliases()` on the
  // handle for the on-demand trigger.

  // Construct the three impostor subsystems in dependency order.  The
  // textured-disk planner depends on the atlas (slot allocation +
  // eviction subscription); the procedural-disk planner is independent.
  const galaxyAtlas = createGalaxyAtlasSubsystem({
    device,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  const texturedDisks = createTexturedDiskSubsystem({
    device,
    atlas: galaxyAtlas,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  const proceduralDisks = createProceduralDiskSubsystem();

  // Bind the atlas's texture view into the LOD-2 disk renderer.  The
  // pre-split code did this through thumbnailSubsystem.bindToRenderers;
  // post-split the atlas owns the view and the binding is one direct
  // call.  proceduralDiskRenderer doesn't sample the atlas, so it
  // doesn't get a bindAtlas call.
  texturedDiskRenderer.bindAtlas(galaxyAtlas.getTextureView());

  state.subsystems.galaxyAtlas = galaxyAtlas;
  state.subsystems.texturedDisks = texturedDisks;
  state.subsystems.proceduralDisks = proceduralDisks;

  // Register the always-on overlay fade handles at opacity 1.0. The
  // registry surfaces these to a future tour subsystem (which can
  // fadeTo them programmatically) without any per-renderer plumbing.
  // No loading-time fade-in is needed — the three overlays are
  // procedural or bundled and appear immediately on first frame.
  // `register(handle, 1)` sets the steady-state opacity directly; no
  // setImmediate(1) follow-up is required.
  // Milky Way registers at its current settings value (not blanket 1.0)
  // because the toggle path multiplies this opacity into the renderer's
  // distance-based fadeAlpha. If we always registered at 1 regardless
  // of settings, a default-off session would still draw the Milky Way
  // on the first frame after wireSlots completes — the settings.gate
  // check used to be the only thing keeping it off. Now both must agree.
  state.subsystems.fades.register(
    { kind: 'overlay', id: 'milkyWay' },
    state.settings.milkyWay.enabled ? 1 : 0,
  );
  state.subsystems.fades.register({ kind: 'overlay', id: 'proceduralDisks' }, 1);
  state.subsystems.fades.register({ kind: 'overlay', id: 'texturedDisks' }, 1);

  // Scalar-volume master gate. Registered at the current settings
  // value so a default-on session sees 1.0 from frame 1 (and the
  // encodeHdr* multipliers don't accidentally suppress the per-field
  // opacities); a default-off session sits at 0 until the user
  // toggles master on, at which point setVolumesEnabled fires fadeTo
  // up to 1 over FADE_IN_DURATION_MS.
  state.subsystems.fades.register(
    { kind: 'volumesMaster' },
    state.settings.volumes.masterEnabled ? 1 : 0,
  );

  // Register the four label-layer fade handles. youAreHere / poi /
  // galaxyNames start at 0 — their producers fire fadeTo(1) on first
  // non-empty emit (see youAreHereSubsystem + poiSubsystem). scaleBar
  // is React-side so we register it at 1 — present in the registry
  // for tour addressability but never auto-faded by the engine.
  //
  // v1 only registers the handles; the label renderer doesn't plumb
  // their opacity into draw yet. Tour playback can already address
  // these via state.subsystems.fades.fadeTo(...); per-layer-aware
  // label draws are a follow-up plan.
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'youAreHere' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'poi' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'galaxyNames' }, 0);
  state.subsystems.fades.register({ kind: 'labelLayer', layer: 'scaleBar' }, 1);

  // Signal loading state immediately so the user knows something is
  // happening before the (potentially multi-second) fetch completes.
  cb.lifecycle?.onStatusChange?.({ kind: 'loading' });

  // ── Progressive survey loading ────────────────────────────────────
  //
  // Each survey flows through its own `AssetSlot`. The slot's long-lived
  // commit subscriber (wired at slot construction) handles upload +
  // `catalogs.set` + `onCatalogReady` + `requestRender` on every
  // transition to `ready`. This block kicks off loads and registers two
  // background subscribers; it does NOT block bootstrap on data arrival.
  //
  //   1. Per-arrival status emission: each time a slot reaches `ready`
  //      with `count > 0`, fire `cb.onStatusChange({ kind: 'ready',
  //      count: <running total>, source })` so the status bar reflects
  //      progressive disclosure as surveys land.
  //   2. Synthetic fallback: when every `survey`-category source has
  //      settled with no successful ready+count>0, fire the synthetic
  //      slot's load.  `curated` sources (Famous) are excluded — a
  //      Famous-only success shouldn't suppress synthetic, a
  //      Famous-only failure shouldn't trigger it.
  //
  // Both lists are derived from `GALAXY_CATALOG_SOURCE_REGISTRY` so
  // adding a new tier-fetched survey is one registry-row edit, not
  // three scattered enum literals.
  const realSet = new Set(SURVEY_POINT_SOURCES);

  let realSettled = 0;
  let anyRealReady = false;
  for (const source of TIER_FETCHED_POINT_SOURCES) {
    const slot = state.assetSlots.points.get(source);
    // A hidden-at-boot survey won't auto-load, so its slot stays in
    // `idle` forever — never transitions to ready/error.  Treat it as
    // "settled" here so the synthetic-fallback gate doesn't wait
    // indefinitely.  When the user later toggles it on, the load
    // fires (via `setSourceVisible`) and the upload happens, but by
    // then the fallback decision is long made.
    const hiddenAtBoot = !maskHas(state.sources.drawMask, source);
    if (!slot || hiddenAtBoot) {
      if (realSet.has(source)) {
        realSettled++;
        maybeFireSyntheticFallback();
      }
      continue;
    }
    let counted = false;
    const unsub = slot.subscribe((s) => {
      if (s.kind === 'ready' && s.value.count > 0) {
        cb.lifecycle?.onStatusChange?.({
          kind: 'ready',
          count: state.gpu.renderer?.totalCount() ?? 0,
          source,
        });
        if (realSet.has(source)) anyRealReady = true;
      }
      if (counted) return;
      if (s.kind === 'ready' || s.kind === 'error') {
        counted = true;
        unsub();
        if (realSet.has(source)) {
          realSettled++;
          maybeFireSyntheticFallback();
        }
      }
    });
  }

  function maybeFireSyntheticFallback(): void {
    if (realSettled < realSet.size || anyRealReady) return;
    const synthSlot = state.assetSlots.points.get(Source.Synthetic);
    if (!synthSlot) return;
    synthSlot.subscribe((s) => {
      if (s.kind === 'ready' && s.value.count > 0) {
        cb.lifecycle?.onStatusChange?.({
          kind: 'ready',
          count: state.gpu.renderer?.totalCount() ?? 0,
          source: Source.Synthetic,
        });
      }
    });
    synthSlot.load({ source: Source.Synthetic, tier: state.sources.tier });
  }

  // Boot-load only visible sources. Off-by-default surveys skip their
  // multi-MB fetch until the user toggles them on (where
  // `setSourceVisible` fires the slot's idempotent `.load()`).
  // Companion sidecars ride alongside via the registry's `companions`
  // list — see `loadCompanionAssets`.
  for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
    if (cfg.category === 'synthetic') continue;
    if (!maskHas(state.sources.drawMask, cfg.source)) continue;
    state.assetSlots.points
      .get(cfg.source)
      ?.load({ source: cfg.source, tier: state.sources.tier });
    loadCompanionAssets(state, cfg, state.sources.tier);
  }
  // Filaments load exactly once at boot — never on tier change.
  // See `filamentFetcher.ts` for the rationale.
  state.assetSlots.filaments?.load({ tier: state.sources.tier });
  // CF-4 DM density loads at boot only when its default is ON;
  // otherwise the slot stays idle and `engine.setVolumeFieldEnabled`
  // triggers a lazy load on toggle. No tier dependency.
  if (DEFAULT_CF4_DENSITY_ENABLED) {
    state.assetSlots.cf4Density?.load();
  }
  // MCPM Cosmic Web loads at the boot tier; `engine.setTier` reloads
  // on tier change. Missing/404 .scfd silently omits the field from
  // the Volumes panel.
  state.assetSlots.mcpm?.load({ tier: state.sources.tier });
}
