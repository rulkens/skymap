/**
 * wireSlots — bootstrap phase that wires sidecar asset slots, the
 * load-progress emitter, the thumbnail subsystem, and kicks off the
 * parallel multi-survey load.
 *
 * The 5 point-source slots are minted earlier (in `initGpu`, immediately
 * after the renderer that they commit into). This phase covers the rest:
 *
 *   - Filament, CF-4 DM density, MCPM Cosmic Web volume slots.
 *   - Famous-meta + cluster-catalog + PGC-alias sidecar slots.
 *   - Synthetic-volume DEV fixtures.
 *   - The `allSlots` registry + load-progress emitter.
 *   - The galaxy-atlas / textured-disk / procedural-disk subsystems.
 *   - The three-group POI projection (via `wirePoiProjection`).
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
 *   - `state.sources.famousMeta` — via famous-meta subscriber (on `ready`).
 *   - `state.sources.clusterBulk` — via cluster-catalog subscriber (on `ready`).
 *   - `state.sources.catalogs` — populated by the per-source slot commit
 *     subscribers (wired in `initGpu`).
 *   - `state.subsystems.pois` — via `wirePoiProjection` (three keyed groups).
 *   - `state.subsystems.loadProgress`, and the five impostor subsystem
 *     handles (via `wireImpostorSubsystems`).
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
import { createFilamentSlot } from '../../loading/slots/filamentSlot';
import { createClusterCatalogSlot } from '../../loading/slots/clusterCatalogSlot';
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';
import { createMcpmSlot } from '../../loading/slots/mcpmSlot';
import { createFamousMetaSlot } from '../../loading/slots/famousMetaSlot';
import { createPgcAliasSlot } from '../../loading/slots/pgcAliasSlot';
import { createSyntheticVolumeSlots } from '../../loading/slots/syntheticVolumeSlots';
import { createLoadProgressEmitter } from '../subsystems/loadProgressAggregator';
import { wireImpostorSubsystems } from '../wiring/wireImpostorSubsystems';
import { registerOverlayFades } from '../wiring/registerOverlayFades';
import { wirePoiProjection } from '../wiring/wirePoiProjection';
import { SOURCE_REGISTRY } from '../../../data/sources';

import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';

/**
 * Bootstrap phase 2: sidecar slots + load-progress emitter + thumbnail
 * subsystem + parallel multi-survey load with synthetic fallback.
 */
export async function wireSlots(state: EngineState, deps: BootstrapDeps): Promise<void> {
  const { cb, allSlots } = deps;

  // Fail-fast precondition: both disk renderers must be non-null before any
  // slot construction touches EngineState.  The same check is repeated inside
  // `wireImpostorSubsystems` co-located with the reads it guards — the
  // redundancy is intentional and cheap.
  if (state.gpu.texturedDiskRenderer === null || state.gpu.proceduralDiskRenderer === null) {
    throw new Error(
      'wireSlots: texturedDisk/proceduralDisk renderers must be initialised by initGpu before this phase runs',
    );
  }

  // ── Filament asset slot ──────────────────────────────────────────
  // Factory owns the mint + subscribe + state write.  See
  // `loading/slots/filamentSlot.ts` for the lifecycle rationale.
  const filamentSlot = createFilamentSlot(state, cb);

  // ── CF-4 DM density volume slot ──────────────────────────────────
  // Slot minted unconditionally; the boot-time `.load()` below is
  // gated on `SOURCE_REGISTRY[Source.Cf4Density].visible` so a default-off CF-4
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

  // ── Famous-galaxy sidecar slot ───────────────────────────────────
  // Factory owns the mint + subscribe + state write.  See
  // `loading/slots/famousMetaSlot.ts` for the dual-sidecar rationale and
  // the graceful-degradation policy on fetch error.
  const famousMetaSlot = createFamousMetaSlot(state, cb);

  // ── Cluster/supercluster bulk-coverage slot ──────────────────────
  // Boot-time, tier-agnostic asset (like filaments + famous-meta): the
  // numeric `.ccat` + meta sidecar that the bulk POI producer turns into
  // the ~375 non-featured ring/halo structures.  Factory owns the mint +
  // subscribe + state write (`state.sources.clusterBulk`).  Unlike
  // famous-meta this is NOT a registry companion, so its `.load({})`
  // fires explicitly from the boot-load section below alongside filaments.
  const clusterCatalogSlot = createClusterCatalogSlot(state, cb);

  // ── POI projection (three keyed groups) ─────────────────────────
  //
  // Wires static anchors (synchronous), the famous 2-asset join, and the
  // bulk-cluster subscription into the poiSubsystem via its keyed
  // setGroup/clearGroup API.  Keyed groups prevent any one async arrival
  // from clobbering the others — each subscriber only ever touches its
  // own group key.  See `wirePoiProjection.ts` for the full rationale.
  wirePoiProjection(state, cb);

  // ── PGC-alias slot ───────────────────────────────────────────────
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
  // The per-engine loading-bar aggregator is a thin subscriber over
  // `aggregateRegistry`.  Build the slot registry here (now that every
  // slot exists) and hand it to the emitter; `attachSlot` then wires
  // each slot's `subscribe` so that any state transition recomputes
  // the projection and forwards the snapshot to `cb.onLoadProgress`.
  //
  // A single shared Map (rather than per-subset `attachSlot` calls)
  // also feeds the dev panel's per-slot view; building it once here
  // keeps both consumers in lockstep on what counts as "in flight".
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
    clusterCatalogSlot.name,
    clusterCatalogSlot as unknown as AssetSlot<unknown, unknown>,
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

  // Build and wire the five impostor subsystems (galaxy atlas, textured
  // disks, procedural disks, hi-res Famous texture + planner).  The
  // renderer null-check and all construction details live in the
  // extracted module so each bootstrap concern has its own home.
  wireImpostorSubsystems(state, deps);

  // Register overlay, volume-master, and label-layer fade handles.
  // Initial opacities are settings-derived so frame 1 is coherent with
  // the user's stored preferences.  Details in registerOverlayFades.ts.
  registerOverlayFades(state);

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
    state.assetSlots.points.get(cfg.source)?.load({ source: cfg.source, tier: state.sources.tier });
    loadCompanionAssets(state, cfg, state.sources.tier);
  }
  // Filaments load exactly once at boot — never on tier change.
  // See `filamentFetcher.ts` for the rationale.
  state.assetSlots.filaments?.load({ tier: state.sources.tier });
  // Cluster/supercluster bulk coverage loads exactly once at boot — it's
  // tier-agnostic and not a registry companion, so it needs its own
  // explicit `.load({})` here (empty `ClusterCatalogReq`).  The slot
  // subscriber writes `state.sources.clusterBulk`; `wirePoiProjection`
  // (above) picks it up on the `ready` transition via the keyed group.
  clusterCatalogSlot.load({});
  // CF-4 DM density loads at boot only when its default is ON;
  // otherwise the slot stays idle and `engine.setVolumeFieldEnabled`
  // triggers a lazy load on toggle. No tier dependency.
  if (SOURCE_REGISTRY[Source.Cf4Density].visible) {
    state.assetSlots.cf4Density?.load();
  }
  // MCPM Cosmic Web loads at the boot tier; `engine.setTier` reloads
  // on tier change. Missing/404 .scfd silently omits the field from
  // the Volumes panel.
  state.assetSlots.mcpm?.load({ tier: state.sources.tier });
}
