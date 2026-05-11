/**
 * pointSourceRegistry — declarative wiring for the engine's per-source
 * point-cloud asset slots.
 *
 * ### Why a registry?
 *
 * Pre-Phase-4 the bootstrap IIFE in `engine.ts` had a single ~60-line
 * loop that iterated `[Source.SDSS, Source.TwoMRS, Source.Glade,
 * Source.Famous, Source.Synthetic]`, branching on
 * `source === Source.Synthetic` to pick the fetcher and otherwise
 * building each slot identically.  That loop was already a dedupe of
 * five copy-pasted blocks from earlier in the project's history — a
 * mid-Spec-A cleanup — but it still mixed three concerns:
 *
 *   1. *Per-source variance* (which fetcher, which initial tier, which
 *      retry policy) — declarative data;
 *   2. *Slot construction* (build the AssetSlot, attach the commit
 *      body, register subscribers) — uniform plumbing;
 *   3. *Engine-state side effects* (mutate `state.sources.clouds`,
 *      fire `cb.onCloudReady`, wake the scheduler) — shared lifecycle.
 *
 * Pulling (1) into a `POINT_SOURCE_REGISTRY` table and (2)+(3) into a
 * `wirePointSourceSlot` helper makes "what differs across sources"
 * legible at a glance — anyone adding a new survey edits one row of
 * the registry rather than tracing through a multi-arm conditional in
 * the middle of a 1100-line bootstrap IIFE.  And the engine.ts side
 * collapses to:
 *
 *   for (const cfg of POINT_SOURCE_REGISTRY) wirePointSourceSlot(state, cfg, deps);
 *
 * ### What the previous shape looked like (so the diff is auditable)
 *
 * The pre-registry loop fused the per-source switch into the slot's
 * `fetch` field via a ternary:
 *
 *   const fetch = source === Source.Synthetic ? syntheticPointFetcher
 *                                              : pointCloudFetcher;
 *   const slot = createAssetSlot({ name, fetch, commit: ... });
 *   slot.subscribe((s) => { if (s.kind === 'ready') { cb.onCloudReady?.(...); requestRender(); } });
 *   state.assetSlots.points.set(source, slot);
 *
 * The registry rephrases that ternary as data ("each row names its own
 * fetcher") and the helper inlines the rest unchanged.  Behaviour is
 * byte-for-byte identical — the relocation is the win, not a rewrite.
 *
 * ### Why sidecar slots stay bespoke
 *
 * The bootstrap also constructs three *sidecar* slots that are NOT in
 * this registry:
 *
 *   - `filaments` — different fetcher (`filamentFetcher`), different
 *     payload shape (`FilamentCloud` not `PointCloud`), different
 *     renderer target (`FilamentRenderer.upload`), one-shot lifecycle
 *     (never reloaded on tier change).  Forcing it through a
 *     "PointSourceConfig" would require parameterising the payload
 *     type, the commit target, AND the lifecycle hook on every row of
 *     the registry — a generic abstraction whose only consumer is the
 *     odd-one-out, paid for by the four normal rows.
 *   - `famous-meta` — pure metadata, no `commit` step, custom error
 *     handling that maps `kind: 'error'` to "feature off" by writing
 *     empty meta/xrefs (graceful degradation that the point-source
 *     subscriber doesn't have).
 *   - `pgc-aliases` — lazy load triggered by the public handle's
 *     `loadPgcAliases()` shim, not at boot.  Wrong lifecycle for a
 *     boot-time registry loop.
 *
 * Each sidecar has materially divergent shape and a single inline
 * construction site.  Absorbing them into the registry would expand the
 * config type to cover their differences and turn `wirePointSourceSlot`
 * into a coordinator that branches on slot kind — exactly the smell the
 * registry is meant to remove from engine.ts.  They stay inline.
 *
 * ### Why `initialTier` lives on the config but isn't read by the
 *     helper
 *
 * The bootstrap separates *slot construction* (this helper) from *first
 * load* (a later block in engine.ts that calls
 * `state.assetSlots.points.get(source)?.load({ source, tier: state.sources.tier })`
 * for each real source).  Initial tier therefore comes from
 * `state.sources.tier`, seeded at engine init from `opts.initialTier`,
 * not from per-source config.
 *
 * The `initialTier` field nevertheless lives on `PointSourceConfig` for
 * two reasons:
 *
 *   1. The spec (`docs/superpowers/specs/2026-05-08-engine-internal-restructure-design.md#3`)
 *      lists per-source initial tiers as part of the registry's
 *      declarative shape — making the future direction (per-source
 *      tier overrides) discoverable from the type without a re-spec.
 *   2. Synthetic ignores tier altogether; documenting that with a
 *      placeholder value on the row keeps the type uniform across all
 *      five entries rather than introducing an `initialTier?: Tier`
 *      partial-shape mismatch.
 *
 * If a future caller needs per-source initial tiers, the helper grows
 * one line; today it's correct to leave `state.sources.tier` as the
 * single source of truth.
 *
 * ### Consumer pattern (in `engine.ts`)
 *
 * ```ts
 * for (const cfg of POINT_SOURCE_REGISTRY) {
 *   wirePointSourceSlot(state, cfg, { cb });
 * }
 * // ... sidecar slots constructed inline below ...
 * // ... the post-loop allSlots aggregation runs unchanged ...
 * ```
 *
 * `state.assetSlots.points.set(source, slot)` happens inside the
 * helper, so by the time the loop ends every `state.assetSlots.points`
 * lookup the rest of the bootstrap relies on (the
 * `allArrivalsPromise`, the synthetic-fallback gate, the post-loop
 * `allSlots` registry population) sees the same Map it always did.
 */

import type { EngineCallbacks, EngineState, PointCloud } from '../../../@types';
import type { Tier } from '../../../@types/Tier';
import { Source } from '../../../data/sources';
import type { Fetcher } from '../../loading/types';
import { createAssetSlot } from '../../loading/AssetSlot';
import {
  pointCloudFetcher,
  type PointCloudReq,
} from '../../loading/fetchers/pointCloudFetcher';
import { syntheticPointFetcher } from '../../loading/fetchers/syntheticPointFetcher';
import { isEngineReady } from '../helpers/engineReady';

/**
 * Lowercase short name for a Source — `sdss`, `2mrs`, `glade`,
 * `famous`, `synthetic`.  Used as the stable prefix for the slot's
 * name (e.g. `sdss-points`, `glade-points`) and inside the upload-log
 * line below.
 *
 * Lives here rather than next to `LABELS` in `data/sources.ts` because
 * the only consumers today are this file's slot-name + log-line
 * strings.  Promote to `data/sources.ts` if a third unrelated caller
 * appears.  (Phase 4 moved this function out of `engine.ts` — there
 * is no longer a duplicate to keep in sync.)
 */
function sourceName(source: Source): string {
  switch (source) {
    case Source.SDSS:
      return 'sdss';
    case Source.TwoMRS:
      return '2mrs';
    case Source.Glade:
      return 'glade';
    case Source.Famous:
      return 'famous';
    case Source.Synthetic:
      return 'synthetic';
  }
}

/**
 * One row of the registry.
 *
 * The fields capture exactly the dimensions that vary across the five
 * point-source slots; everything else (slot name shape, commit body,
 * subscriber side effects) is uniform and lives in
 * `wirePointSourceSlot`.
 */
export type PointSourceConfig = {
  /** Which catalog this slot represents. */
  source: Source;
  /**
   * Fetcher used to materialise the slot's request into a PointCloud.
   * The four real surveys share `pointCloudFetcher` (which dispatches
   * on `req.source` to pick the right .bin URL); Synthetic uses
   * `syntheticPointFetcher` (which procedurally generates a cloud and
   * ignores `req.tier`).
   */
  fetcher: Fetcher<PointCloud, PointCloudReq>;
  /**
   * Declarative initial tier for the slot.  See the module-header
   * "Why initialTier lives on the config but isn't read by the helper"
   * note — this field is for forward-uniformity with the spec; the
   * actual first-load tier today comes from `state.sources.tier`.
   */
  initialTier: Tier;
};

/**
 * The full registry, in Source enum order so the boot-time arrival
 * promise's `ALL_POINT_SOURCES` array (declared in engine.ts) keeps
 * iterating in the same order it always did.
 *
 * Initial tiers per the spec sketch:
 *   - SDSS / TwoMRS / Famous → 'medium'
 *   - GLADE → 'small'  (large catalog; medium is desktop-only)
 *   - Synthetic → 'small'  (fetcher ignores tier; placeholder)
 *
 * Today these values are not consumed by `wirePointSourceSlot`; they
 * are documentation that travels with the registry.  See the module
 * header for why.
 */
export const POINT_SOURCE_REGISTRY: readonly PointSourceConfig[] = [
  { source: Source.SDSS, fetcher: pointCloudFetcher, initialTier: 'medium' },
  { source: Source.TwoMRS, fetcher: pointCloudFetcher, initialTier: 'medium' },
  { source: Source.Glade, fetcher: pointCloudFetcher, initialTier: 'small' },
  { source: Source.Famous, fetcher: pointCloudFetcher, initialTier: 'medium' },
  { source: Source.Synthetic, fetcher: syntheticPointFetcher, initialTier: 'small' },
];

/**
 * Shared dependencies the helper needs that aren't on `EngineState`.
 *
 * `cb` is the engine's callback bag — used for the `onCloudReady` echo
 * that runs on the slot's `ready` transition.  Passing it as one
 * named field (rather than threading individual callbacks through)
 * keeps the call site at a single line and matches how the rest of
 * the engine treats the `EngineCallbacks` value.
 */
export type WirePointSourceDeps = {
  cb: EngineCallbacks;
};

/**
 * Build the asset slot for one point-source survey, attach its commit
 * body and ready-state subscriber, and register it in
 * `state.assetSlots.points`.
 *
 * Idempotency / re-wire: not supported.  Calling this twice for the
 * same source overwrites the previous slot in `state.assetSlots.points`
 * but leaves the old slot's subscribers attached (the slot itself has
 * no destroy method); the caller is expected to wire each source
 * exactly once during bootstrap.  This matches the pre-registry loop's
 * contract.
 *
 * Lifecycle ordering: this MUST run AFTER `state.gpu.renderer` is
 * assigned — the commit step uploads to it.  In engine.ts's bootstrap
 * IIFE that ordering is preserved by calling the registry loop after
 * `state.gpu.renderer = renderer`.  See the bootstrap's "Why construct
 * here, after the renderer exists?" note for the why.
 */
export function wirePointSourceSlot(
  state: EngineState,
  cfg: PointSourceConfig,
  deps: WirePointSourceDeps,
): void {
  const { source, fetcher } = cfg;
  const { cb } = deps;
  const slotName = `${sourceName(source)}-points`;

  const slot = createAssetSlot<PointCloud, PointCloudReq>({
    name: slotName,
    fetch: fetcher,
    commit: async (cloud) => {
      // Renderer might be missing for two reasons:
      //   (a) the GPU init phase hasn't run yet (very first frame
      //       window — possible with synchronous fetch fixtures in
      //       tests, but rare in production)
      //   (b) the renderer was destroyed mid-load (StrictMode unmount,
      //       hot-reload).
      //
      // Either way, drop the upload silently; the slot still transitions
      // to `ready` but no GPU buffer exists to consume it.
      //
      // ### Why a bespoke `state.gpu.renderer` check, NOT `isEngineReady`
      //
      // D.4 originally consolidated this site onto `isEngineReady` on
      // the reasoning that "destroy() nulls all five bootstrap-bag
      // fields together, so any one being null implies the others".
      // That holds for *teardown* — but NOT for *bootstrap progression*.
      // The slot's commit fires during the `wireSlots` phase, which
      // runs BEFORE `wireInput` creates `pickRenderer` and `cam`.  At
      // that lifecycle point, only `renderer`, `postProcess`, and
      // `thumbnails` are set — `isEngineReady` returns false, the
      // commit skips, and the cloud never reaches the GPU.  Visible
      // symptom: black screen with no console errors.
      //
      // The renderer-only check captures the actual invariant the
      // commit cares about (does the destination exist?) without
      // entangling it with handles populated later in the bootstrap
      // chain.
      if (state.gpu.renderer === null) return;
      const t0 = performance.now();
      // eslint-disable-next-line no-console
      console.log(
        `[engine] upload start ${sourceName(source)} count=${cloud.count}`,
      );
      await state.gpu.renderer.upload(source, cloud);
      state.sources.clouds.set(source, cloud);
      const dtMs = Math.round(performance.now() - t0);
      // After upload, dump what the GPU actually has — the source of
      // truth the draw loop reads from.  If this disagrees with the
      // slot's reported `cloud.count`, the upload landed on the
      // renderer but something else (e.g. a parallel rebake or a
      // concurrent upload for the same source) overwrote it.
      const onGpu = Array.from(state.gpu.renderer.loadedSources())
        .map((e) => `${sourceName(e.source)}=${e.count}`)
        .join(', ');
      const total = state.gpu.renderer.totalCount();
      // eslint-disable-next-line no-console
      console.log(
        `[engine] upload done  ${sourceName(source)} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
  });

  slot.subscribe((s) => {
    // Per-slot byte-count plumbing into the loading-bar aggregator is
    // gone post-Task-12 — the new `createLoadProgressEmitter`
    // recomputes from `aggregateRegistry(slots)` on every state
    // change, so this subscriber only needs to fire the app-visible
    // side effects (cb echo + render wake) on the `ready` transition.
    if (s.kind === 'ready') {
      cb.onCloudReady?.(source, s.value.count);
      cb.sources?.onCloudReady?.(source, s.value.count);
      state.subsystems.scheduler.requestRender();
    }
  });

  state.assetSlots.points.set(source, slot);
}
