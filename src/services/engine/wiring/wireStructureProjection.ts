/**
 * wirePoiProjection — wires the three independently-arriving POI groups
 * into the `poiSubsystem` via its keyed `setGroup`/`clearGroup` API.
 *
 * ### Why keyed groups replace the old `rebuildAllPois` merge
 *
 * The predecessor pattern held a single `rebuildAllPois` closure that
 * concatenated whichever groups were available (`[...staticAnchorPois,
 * ...famousPois, ...clusterBulkPois]`) and called `setPois` with the full
 * merged list on every subscription event.  That worked as long as all
 * three subscriptions routed through the single rebuild — a subscriber
 * that called `setPois` independently would clobber the other groups,
 * because `setPois` replaces the entire list.
 *
 * Keyed groups eliminate the clobber risk structurally: each subscriber
 * owns exactly one group key and can only modify that key.  The subsystem
 * merges in a fixed order (`staticAnchors → famous → clusterBulk`), so
 * arrival order among the async groups does not affect the final list.
 * An out-of-order clusterBulk arrival can never overwrite the famous
 * group, because it only calls `setGroup('clusterBulk', ...)`.
 *
 * ### Group semantics and arrival schedule
 *
 *   - `staticAnchors` — hand-curated cluster/SC/void anchors from
 *     `buildStaticAnchorPois`.  Published synchronously at boot so the
 *     Structures panel has counts from frame 1.
 *   - `famous` — requires BOTH the `famousMeta` slot (names + diameter)
 *     AND the Famous catalog slot (world positions).  Either alone is
 *     insufficient — `buildPoisFromFamousMeta` needs both.  The join
 *     fires whenever EITHER slot transitions; it reads the current state
 *     of the other asset from `state.sources` (written by the respective
 *     slot's own subscriber in the load chain).
 *   - `clusterBulk` — built from the cluster-catalog slot's ready value
 *     when it lands.  A single subscription.  Records are written to the
 *     authoritative `structureStore` and mirrored into `poiSubsystem`.
 *
 * ### Structure-count emissions
 *
 * After every group change we forward `{ cluster, supercluster, void }`
 * counts to `cb.sources?.onStructureCountsChange` so the Structures
 * panel's toggles can display "Clusters 573" alongside their checkboxes.
 * Counts are read from `structureStore.byCategory` — the authoritative
 * record set — so the number matches exactly what will render.  Famous
 * galaxies are a label-only category and not a Structures panel row, so
 * they're excluded from the emission.
 */

import { Source } from '../../../data/sources';
import { buildStaticAnchorPois } from '../../../data/buildStaticAnchorPois';
import { buildPoisFromFamousMeta } from '../phases/buildPoisFromFamousMeta';
import { buildPoisFromClusterCatalog } from '../phases/buildPoisFromClusterCatalog';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * Wire the three POI groups into the `poiSubsystem` via keyed groups.
 *
 * Precondition: `state.assetSlots.famousMeta` and
 * `state.assetSlots.clusterCatalog` and `state.assetSlots.points.get(
 * Source.Famous)` must all be non-null — they are minted by `wireSlots`
 * before this function is called.  The Famous catalog slot is looked up
 * defensively and skips wiring its subscription if absent, which can
 * only happen in test environments that don't seed the Famous slot.
 */
export function wirePoiProjection(state: EngineState, cb: EngineCallbacks): void {
  /**
   * Emit fresh per-category structure counts after any group change.
   * Called once at boot (static anchors) and again whenever an async
   * group lands or clears.  Counts are read from `structureStore.byCategory`
   * so they reflect the authoritative record set — the same one that renders.
   * Famous galaxies are a label-only category; not a Structures row.
   */
  function emitCounts(): void {
    cb.sources?.onStructureCountsChange?.({
      cluster: state.data.structures.byCategory('cluster').length,
      supercluster: state.data.structures.byCategory('supercluster').length,
      void: state.data.structures.byCategory('void').length,
    });
  }

  // ── Group 1: static anchors (synchronous) ───────────────────────────
  //
  // The id-slug + worldPos build lives in `data/buildStaticAnchorPois.ts`
  // so the React-side `usePoiUrlSync` deep-link drain constructs the same
  // records without drifting on slug-rule changes.  physicalRadiusMpc
  // comes from the seed JSON (R_200 / virial radii for clusters,
  // characteristic extent for superclusters and voids).
  const anchors = buildStaticAnchorPois();
  state.data.structures.setGroup('anchors', anchors);
  state.subsystems.pois.setGroup('staticAnchors', anchors);
  emitCounts();

  // ── Group 2: famous galaxies (2-asset join) ──────────────────────────
  //
  // Both the meta sidecar (`galaxyStore.famousMeta`, written by the
  // famousMeta slot subscriber) and the Famous catalog
  // (`galaxyStore.catalogs.get(Source.Famous)`, written by the Famous
  // slot's commit subscriber) must be present before any famous POI is
  // built.  One
  // asset alone carries half the information: meta has names + diameter,
  // the catalog has world positions.  Attempting to build with only one
  // produces partial or zero output, so we clear the group until both are
  // in hand.
  //
  // Subscribing to BOTH slots and re-evaluating the join on EITHER
  // arrival is the minimal correct pattern: whichever slot arrives second
  // will find the other already present in state and complete the join.
  function rebuildFamousGroup(): void {
    const meta = state.data.galaxies.famousMeta;
    const famousCatalog = state.data.galaxies.catalogs.get(Source.Famous);
    if (meta.length > 0 && famousCatalog !== undefined && famousCatalog.count > 0) {
      state.subsystems.pois.setGroup('famous', buildPoisFromFamousMeta(meta, famousCatalog));
    } else {
      state.subsystems.pois.clearGroup('famous');
    }
    emitCounts();
  }

  // Subscribe to the famousMeta slot.  The slot subscriber (in
  // `famousMetaSlot.ts`) writes `galaxyStore.famousMeta` before the
  // subscription fires; reading it here always reflects the latest value.
  state.assetSlots.famousMeta?.subscribe((s) => {
    if (s.kind === 'ready' || s.kind === 'error') rebuildFamousGroup();
  });

  // Subscribe to the Famous catalog slot.  Resolved from `state.assetSlots`
  // rather than a closed-over local so the lookup happens at runtime (the
  // slot is installed by `initGpu` before this phase runs).  Missing slot
  // means Famous was never minted — defensive guard, not expected in
  // production.
  const famousCatalogSlot = state.assetSlots.points.get(Source.Famous);
  if (famousCatalogSlot !== undefined) {
    famousCatalogSlot.subscribe((s) => {
      if (s.kind === 'ready' || s.kind === 'error') rebuildFamousGroup();
    });
  }

  // ── Group 3: bulk clusters/superclusters ─────────────────────────────
  //
  // The bulk records come straight off the cluster-catalog slot's ready
  // value — the authoritative home is `structureStore`'s `bulk` group, and
  // the same records feed `poiSubsystem`'s `clusterBulk` group so the
  // per-frame marker/label producer keeps rendering them unchanged.  A
  // slot error clears both (graceful degradation — bulk structures don't
  // appear but the engine continues normally).
  state.assetSlots.clusterCatalog?.subscribe((s) => {
    if (s.kind === 'ready') {
      const records = buildPoisFromClusterCatalog(s.value);
      state.data.structures.setGroup('bulk', records);
      state.subsystems.pois.setGroup('clusterBulk', records);
    } else if (s.kind === 'error') {
      state.data.structures.clearGroup('bulk');
      state.subsystems.pois.clearGroup('clusterBulk');
    }
    emitCounts();
  });
}
