/**
 * fadeLayers — the fade-ownership manifest + the generic construction seed.
 * Every fadeable layer in the engine is declared here as one `FadeLayer` row;
 * `seedFades(state)` walks the whole manifest once at bootstrap to register
 * and seed each layer's controller. This is the ONE registration site — no
 * other module calls `fades.register` — so the "every fadeable layer" list
 * can never scatter across files and frame-1 coherence stays assertable in
 * one place. Registration is idempotent, so a stray duplicate call would be
 * a harmless no-op regardless.
 *
 * Initial opacities are settings-derived, not a blanket 1.0: registering a
 * disabled layer at 1 draws it on frame 1 before its fade-out fires, and
 * registering an enabled layer at 0 leaves it invisible until `fadeTo(1)`
 * completes. Each row's `seed(settings, item)` returns the value matching the
 * session's persisted settings.
 *
 * Demand-loaded rows (galaxy catalogs, filaments, flow, volume fields) seed
 * at a constant 0 instead, even when their setting is on: they have no
 * payload at construction and fade IN when their data arrives, so a
 * settings-derived seed would pop them to full opacity on frame 1 instead of
 * dissolving in. The seed asymmetry is carried per row as a `seed()` closure
 * rather than one branch over a shared flag.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { EngineState } from '../../../@types/engine/state/EngineState';

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { GALAXY_CATALOG_IDS } from '../../../data/galaxyCatalog/galaxyCatalogIds';
import { BODY_IDS } from '../../../data/bodies/bodyIds';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { SOURCE_REGISTRY } from '../../../data/sources';
import { maybeLazyLoadDebugVolume } from '../volume/maybeLazyLoadDebugVolume';

// Erase a row's Item type for the heterogeneous FADE_LAYERS array while keeping
// its literal `key`. Each row is authored at its concrete Item (full checking on
// expand/handle/seed); the array stores it as FadeLayer<unknown> but with the
// literal key intact, so a type-level test can assert FADE_LAYERS' keys exactly
// cover VisibilityLayerKey. seedFades only ever feeds a row's own expand() output
// back into its handle()/seed(), so the Item erasure is sound at runtime.
const layer = <Item, K extends VisibilityLayerKey>(
  row: FadeLayer<Item> & { readonly key: K },
): FadeLayer<unknown> & { readonly key: K } => row as FadeLayer<unknown> & { readonly key: K };

// Every volume field in the registry — INCLUDING the DEV-only
// binBaseName:null debug fixtures (debug-gaussian/-cartesian/-spherical).
//
// This deliberately differs from `seedVolumeFields`, which excludes the debug
// fixtures from `settings.volumes.items` because that record drives the
// Volumes-panel UI + demand loading. Fade registration has the opposite
// requirement: a fade handle is inert until something fades it, and BOTH the
// debug toggle (dispatches `writeVolumeField` → `syncFades` → fadeTo) and the
// debug slot's commit (`syntheticVolumeSlots.ts`) call `fadeTo({kind:'volumeField'})`
// on these ids. `FadeRegistry.fadeTo` throws on an unregistered id, so the
// debug handles must be seeded here or the DEV toggle breaks. Registering all
// volume fields at 0 is behaviour-preserving in production — the 3 extra debug
// handles are never read there (their field never enters the renderer's map),
// so a registered-but-unused handle costs nothing.
function volumeFieldIds(): readonly VolumeFieldId[] {
  const ids: VolumeFieldId[] = [];
  for (const entry of Object.values(SOURCE_REGISTRY)) {
    if (entry.type !== 'volume') continue;
    ids.push(entry.id);
  }
  return ids;
}

// The star catalogs that actually caption their members. `STAR_CATALOG_IDS`
// spans the whole cluster, but the survey-wide Gaia bin draws no per-star
// names, so a caption fade handle for it would be a controller nothing can
// ever move. Filtering on the registry's `bearsLabel` capability is also what
// keeps the handle's `item` inside `LabelCategory` — the label-bearing ids ARE
// the label categories.
const LABEL_BEARING_STAR_CATALOG_IDS = SOURCE_ENTRIES.filter(
  (e) => e.type === 'starCatalog' && e.bearsLabel,
).map((e) => e.id);

// The same narrowing for bodies, and here the COMPILER insists: the handle's
// `item` must be a `LabelCategory`, which derives from `bearsLabel`. The
// S-stars are the first body row that captions nothing, so `BODY_IDS` — the
// settings key domain — is wider than the caption key domain.
const LABEL_BEARING_BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body' && e.bearsLabel).map(
  (e) => e.id,
);

// The DEV-only runtime-generated fixtures (`binBaseName: null`) — exempt from
// the volumeField row's demand-loaded guard because their lazy-load is
// triggered by that row's own `post`, which a false guard would skip.
const DEBUG_VOLUME_FIELD_IDS: ReadonlySet<VolumeFieldId> = new Set(
  Object.values(SOURCE_REGISTRY)
    .filter((entry) => entry.type === 'volume' && entry.binBaseName === null)
    .map((entry) => entry.id as VolumeFieldId),
);

export const FADE_LAYERS = [
  // milkyWay disk
  layer({
    key: 'milkyWayDisk',
    expand: () => [undefined],
    handle: () => ({ kind: 'milkyWay' }),
    seed: (s) => (s.milkyWay.enabled ? 1 : 0),
    intent: (s) => s.milkyWay.enabled,
  }),
  // procedural disks (always-on)
  layer({
    key: 'proceduralDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'proceduralDisks' }),
    seed: () => 1,
  }),
  // textured disks (always-on)
  layer({
    key: 'texturedDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'texturedDisks' }),
    seed: () => 1,
  }),
  // volumes master gate
  layer({
    key: 'volumesMaster',
    expand: () => [undefined],
    handle: () => ({ kind: 'volumesMaster' }),
    seed: (s) => (s.volumes.enabled ? 1 : 0),
    intent: (s) => s.volumes.enabled,
  }),
  // milkyWay label
  layer({
    key: 'milkyWayLabel',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'milkyWay' }),
    seed: (s) => (s.milkyWay.labelEnabled ? 1 : 0),
    intent: (s) => s.milkyWay.labelEnabled,
  }),
  // survey/galaxy names label. The famous-galaxy
  // label fade reuses the galaxy handle and is driven by the famous-galaxy
  // "Labels" toggle, so this row is settings-derived (intent + seed both read
  // famousGalaxy.labelEnabled) — matching milkyWayLabel/structureLabel.
  layer({
    key: 'surveyLabel',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'galaxy' }),
    seed: (s) => (s.galaxyCatalogs.items.famousGalaxy.labelEnabled ? 1 : 0),
    intent: (s) => s.galaxyCatalogs.items.famousGalaxy.labelEnabled,
  }),
  // curated star-map captions — per label-bearing StarCatalogId,
  // settings-derived seed (the seed is in code, not demand-loaded, so there is
  // no guard and the seed follows the toggle).
  //
  // This handle's opacity has NO CONSUMER. The layer that actually draws these
  // captions, `foregroundLabelsLayer`, reads `starCatalogs.items[id].labelEnabled`
  // straight off settings and runs its own declutter + temporal envelope; it
  // never calls `resolveLayerOpacity` (the only production reader of a fade
  // registry opacity via `fadeIdToVisibilityKey`) for this key. The row is
  // registered anyway because `starCatalogLabel` must be a real
  // `VisibilityLayerKey` — the type-level test over FADE_LAYERS' keys, the
  // `VISIBILITY_ACTION_ROW` factory, and `LAYER_GROUPS.labels`'s clip address
  // space all need the key to exist independent of whether anything reads its
  // fade. So `hide(['starCatalogLabel'])` still works end to end — its settings
  // write (`setStarCatalogLabelEnabled`, via `VISIBILITY_ACTION_ROW`) is what
  // the caption layer reads — but `fade(['starCatalogLabel'], …)` type-checks,
  // registers, and animates a controller nothing multiplies into a drawn pixel.
  // Finishing that wire (multiplying this handle's opacity into the caption's
  // fade target) is a separate piece of work, not attempted here.
  layer({
    key: 'starCatalogLabel',
    expand: () => LABEL_BEARING_STAR_CATALOG_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'starCatalog', item: id }),
    seed: (s, id) => (s.starCatalogs.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.starCatalogs.items[id].labelEnabled,
  }),
  // scene-body captions — per LABEL-BEARING BodyId, settings-derived seed
  // (bodies are seeded in code, so no demand-loaded guard). Not every body row
  // captions itself: the S-stars draw 39 dots and no names, and a handle for a
  // caption that cannot exist would be worse than the unread ones below.
  //
  // Same no-consumer gap as `starCatalogLabel` above: `foregroundLabelsLayer`
  // reads `bodies.items[id].labelEnabled` directly for Earth/planet/Sun
  // captions and never resolves this handle's opacity. Registered for the same
  // reason — the key set that `FADE_LAYERS`, `VISIBILITY_ACTION_ROW`, and the
  // clip address space share must stay total — not because anything reads the
  // fade it drives.
  layer({
    key: 'bodyLabel',
    expand: () => LABEL_BEARING_BODY_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'body', item: id }),
    seed: (s, id) => (s.bodies.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.bodies.items[id].labelEnabled,
  }),
  // scale bar (React-side, tour-addressable)
  layer({
    key: 'scaleBar',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'scaleBar' }),
    seed: () => 1,
  }),
  // structure rings (per StructureId)
  layer({
    key: 'structureRing',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'structure', id }),
    seed: (s, id) => (s.structures.items[id].enabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].enabled,
  }),
  // structure labels (per StructureId)
  layer({
    key: 'structureLabel',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'structure', item: id }),
    seed: (s, id) => (s.structures.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].labelEnabled,
  }),
  // galaxy catalogs — absorbs galaxyCatalogSourceRegistry.ts:154 (demand-loaded; seed 0)
  layer({
    key: 'survey',
    expand: () => GALAXY_CATALOG_IDS,
    handle: (id) => ({ kind: 'galaxyCatalog', id }),
    seed: () => 0,
    intent: (s, id) => s.galaxyCatalogs.items[id].enabled,
    // Demand-loaded gate, like flow/filaments/volumeField: suppress the fade
    // until the catalog's buffer is committed, so an enable that races its
    // .bin download doesn't burn the fade window invisibly. The slot commit's
    // per-item re-sync (syncVisibilityFadeItem) runs after upload, so the
    // guard is already true there.
    guard: (state, id) => state.gpu.galaxyPointRenderer?.hasCatalog(id) ?? false,
    // No `post`: the draw/pick bitmasks are derived per-frame in `runFrame`
    // (and fresh at click time), so a toggle needs no eager mask recompute here.
  }),
  // filament skeleton — absorbs filamentSlot.ts:30 (demand-loaded; seed 0)
  layer({
    key: 'filaments',
    expand: () => [undefined],
    handle: () => ({ kind: 'filament' }),
    seed: () => 0,
    intent: (s) => s.filaments.enabled,
    // Same demand-loaded gate as flow: suppress the fade until the skeleton is
    // committed. Without it, an enable whose download is still in flight (a
    // tour reveal) starts the fade over an empty renderer, and the slot
    // commit's default-duration re-sync then stomps the authored ramp — the
    // layer pops in at whatever the invisible fade had reached.
    guard: (state) => state.gpu.filamentRenderer?.hasCloud() ?? false,
  }),
  // constellation stick figures — singleton demand-loaded overlay (seed 0)
  layer({
    key: 'constellations',
    expand: () => [undefined],
    handle: () => ({ kind: 'constellations' }),
    seed: () => 0,
    intent: (s) => s.constellations.enabled,
    // Same demand-loaded gate as filaments/flow: suppress the fade until the
    // artifact is uploaded (the renderer has drawable segments), so an enable
    // racing the constellations.json download doesn't burn the fade window over
    // an empty renderer.
    guard: (state) => state.gpu.constellationRenderer?.hasData() ?? false,
  }),
  // orbit trails — near-field Keplerian trails (always present; settings-derived
  // seed). Unlike flow/filament, the conic table is a compile-time constant with
  // no asset slot, so there is NO demand-loaded guard and the seed follows the
  // toggle (register at 1 when on, matching milkyWayDisk) rather than 0 — a
  // default-on session must not flash the trails in on frame 1.
  layer({
    key: 'orbitTrails',
    expand: () => [undefined],
    handle: () => ({ kind: 'orbitTrails' }),
    seed: (s) => (s.orbitTrails.enabled ? 1 : 0),
    intent: (s) => s.orbitTrails.enabled,
  }),
  // zone-of-avoidance band — settings-derived seed, like milkyWayDisk (a
  // compile-time overlay with no asset slot, so no demand-loaded guard). One
  // toggle drives both the band and its lettering — see zoneOfAvoidanceLayer.ts.
  layer({
    key: 'zoneOfAvoidance',
    expand: () => [undefined],
    handle: () => ({ kind: 'zoneOfAvoidance' }),
    seed: (s) => (s.zoneOfAvoidance.enabled ? 1 : 0),
    intent: (s) => s.zoneOfAvoidance.enabled,
  }),
  // flow field — absorbs flowFieldSlot.ts:36 (demand-loaded; seed 0)
  layer({
    key: 'flow',
    expand: () => [undefined],
    handle: () => ({ kind: 'flow' }),
    seed: () => 0,
    intent: (s) => s.flow.enabled,
    // Flow's asset is demand-loaded: gate the fade on the renderer's real "cube
    // loaded" truth — true exactly when there is something to render. The same
    // guarded bridge call is then correct for both the toggle (asks "loaded?")
    // and the slot commit (the cube was just uploaded → true).
    guard: (state) => state.gpu.flowFieldRenderer?.fieldLoaded() ?? false,
  }),
  // volume fields — absorbs initGpu.ts onFieldAdded (demand-loaded; seed 0; per
  // VolumeFieldId, including the DEV-only debug fixtures — see volumeFieldIds)
  layer<VolumeFieldId, 'volumeField'>({
    key: 'volumeField',
    expand: () => volumeFieldIds(),
    handle: (id) => ({ kind: 'volumeField', id }),
    seed: () => 0,
    intent: (s, id) => s.volumes.items[id]?.enabled ?? false,
    // Demand-loaded gate, like flow/filaments: suppress the fade until the
    // field is in the renderer's map, so an enable that races its download
    // doesn't burn the fade window invisibly. The DEV debug fixtures are
    // EXEMPT: they are loaded BY this row's own `post` below, and a false
    // guard short-circuits before `post` — suppressing them would mean the
    // toggle that should trigger the lazy-load never does.
    guard: (state, id) =>
      DEBUG_VOLUME_FIELD_IDS.has(id) ||
      (state.gpu.volumeFieldRenderer?.listIds().includes(id) ?? false),
    // Enable-gated lazy-load: re-read the just-applied intent so a disable
    // toggle never triggers a load. The DEV debug fixtures aren't demand rows,
    // so they keep this direct lazy-load; cf4/mcpm load via reevaluateDemand and
    // maybeLazyLoadDebugVolume is a no-op for them, so the two paths partition.
    post: (state, id) => {
      if (state.settings.volumes.items[id]?.enabled) maybeLazyLoadDebugVolume(state, id);
    },
  }),
] satisfies readonly FadeLayer<unknown>[];

/**
 * Register and seed every fade controller from the manifest. Called once at
 * bootstrap (from `wireSlots`). For each row, `expand(state)` yields the row's
 * items; for each item, `handle(item)` names the `FadeId` and `seed(settings,
 * item)` gives the starting opacity. `register` is idempotent, so the order
 * within the manifest is purely diff-stability — no row can clobber another.
 */
export function seedFades(state: EngineState): void {
  const { settings } = state;
  const fades = state.subsystems.fades;
  for (const row of FADE_LAYERS) {
    for (const item of row.expand(state)) {
      fades.register(row.handle(item), row.seed(settings, item));
    }
  }
}
