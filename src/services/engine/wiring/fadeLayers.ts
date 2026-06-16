/**
 * fadeLayers — the fade-ownership manifest + the generic construction seed.
 *
 * Every fadeable layer in the engine is declared here as one `FadeLayer` row,
 * and `seedFades(state)` walks the whole manifest once at bootstrap to register
 * and seed each layer's controller. This is the relocation of what used to be
 * the hand-written `registerOverlayFades` body plus the four out-of-band
 * `register` calls that lived in the demand-loaded slots — now a single
 * declarative table.
 *
 * ### Why initial opacities are settings-derived (not a blanket 1.0)
 *
 * The fade registry is the single source of truth for every layer's opacity.
 * Registering at the wrong initial value produces a one-frame flash: a disabled
 * layer registered at 1 draws on frame 1 before a `setImmediate(0)` fires; an
 * enabled layer registered at 0 is invisible until a `fadeTo(1)` completes. Each
 * row's `seed(settings, item)` returns the value that matches the session's
 * persisted settings so frame 1 is always coherent — milkyWay/volumesMaster/the
 * label and structure rows seed from their toggles, the always-on disk overlays
 * seed at 1.
 *
 * ### Registration now has exactly one home
 *
 * Before this manifest, four demand-loaded sets registered their fade
 * controllers out-of-band — the galaxy-catalog slot, the filament slot, the flow
 * slot, and the volume renderer's `onFieldAdded` callback each called
 * `register` at their own commit time. That scattered the "every fadeable layer"
 * list across five files and made it impossible to assert frame-1 coherence in
 * one place. `seedFades` absorbs all of them: the slot factories and `initGpu`
 * no longer call `register` at all. Registration is idempotent, so even if a
 * stray duplicate `register` survived it would be a harmless no-op — but the
 * intent is that this manifest is the sole registration site.
 *
 * ### Why the demand-loaded sets seed at 0 — the seed is DATA, not a rule
 *
 * The galaxy catalogs, filament, flow, and volume fields are demand-loaded: they
 * have no payload at construction and fade *in* (`fadeTo(1)`) when their data
 * arrives. They must therefore seed at 0 so that first-load fade-in is visible.
 * A single uniform `settings ? 1 : 0` rule across all rows would erase that
 * fade-in — a demand-loaded layer whose setting is on would pop to full opacity
 * on frame 1 instead of dissolving in. So the seed asymmetry is carried per row
 * as a `seed()` closure (settings-derived for the overlay/structure rows, a
 * constant 0 for the demand-loaded rows), not as one branch over a shared flag.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { EngineState } from '../../../@types/engine/state/EngineState';

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { GALAXY_CATALOG_IDS } from '../../../data/galaxyCatalog/galaxyCatalogIds';
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
// debug toggle (`engine.ts` setVolumeFieldEnabled → fadeTo) and the debug
// slot's commit (`syntheticVolumeSlots.ts`) call `fadeTo({kind:'volumeField'})`
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

export const FADE_LAYERS = [
  // milkyWay disk — absorbs registerOverlayFades.ts:64-67
  layer({
    key: 'milkyWayDisk',
    cluster: 'milkyWay',
    expand: () => [undefined],
    handle: () => ({ kind: 'milkyWay' }),
    seed: (s) => (s.milkyWay.enabled ? 1 : 0),
    intent: (s) => s.milkyWay.enabled,
  }),
  // procedural disks — registerOverlayFades.ts:70 (always-on)
  layer({
    key: 'proceduralDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'proceduralDisks' }),
    seed: () => 1,
  }),
  // textured disks — registerOverlayFades.ts:71 (always-on)
  layer({
    key: 'texturedDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'texturedDisks' }),
    seed: () => 1,
  }),
  // volumes master gate — registerOverlayFades.ts:80-83
  layer({
    key: 'volumesMaster',
    cluster: 'volumes',
    expand: () => [undefined],
    handle: () => ({ kind: 'volumesMaster' }),
    seed: (s) => (s.volumes.enabled ? 1 : 0),
    intent: (s) => s.volumes.enabled,
  }),
  // milkyWay label — registerOverlayFades.ts:95-98
  layer({
    key: 'milkyWayLabel',
    cluster: 'milkyWay',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'milkyWay' }),
    seed: (s) => (s.milkyWay.labelEnabled ? 1 : 0),
    intent: (s) => s.milkyWay.labelEnabled,
  }),
  // survey/galaxy names label — registerOverlayFades.ts:99. The famous-galaxy
  // label fade reuses the galaxyNames handle and is driven by the famous-galaxy
  // "Labels" toggle, so this row is settings-derived (intent + seed both read
  // famousGalaxy.labelEnabled) — matching milkyWayLabel/structureLabel.
  layer({
    key: 'surveyLabel',
    cluster: 'galaxyCatalogs',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'galaxyNames' }),
    seed: (s) => (s.galaxyCatalogs.items.famousGalaxy.labelEnabled ? 1 : 0),
    intent: (s) => s.galaxyCatalogs.items.famousGalaxy.labelEnabled,
  }),
  // scale bar — registerOverlayFades.ts:100 (React-side, tour-addressable)
  layer({
    key: 'scaleBar',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'scaleBar' }),
    seed: () => 1,
  }),
  // structure rings — registerOverlayFades.ts:109-113 (per StructureId)
  layer({
    key: 'structureRing',
    cluster: 'structures',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'structure', id }),
    seed: (s, id) => (s.structures.items[id].enabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].enabled,
  }),
  // structure labels — registerOverlayFades.ts:114-117 (per StructureId)
  layer({
    key: 'structureLabel',
    cluster: 'structures',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'structure', category: id }),
    seed: (s, id) => (s.structures.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].labelEnabled,
  }),
  // galaxy catalogs — absorbs galaxyCatalogSourceRegistry.ts:154 (demand-loaded; seed 0)
  layer({
    key: 'survey',
    cluster: 'galaxyCatalogs',
    expand: () => GALAXY_CATALOG_IDS,
    handle: (id) => ({ kind: 'galaxyCatalog', id }),
    seed: () => 0,
    intent: (s, id) => s.galaxyCatalogs.items[id].enabled,
    // No `post`: the draw/pick bitmasks are derived per-frame in `runFrame`
    // (and fresh at click time), so a toggle needs no eager mask recompute here.
  }),
  // filament skeleton — absorbs filamentSlot.ts:30 (demand-loaded; seed 0)
  layer({
    key: 'filaments',
    cluster: 'filaments',
    expand: () => [undefined],
    handle: () => ({ kind: 'filament' }),
    seed: () => 0,
    intent: (s) => s.filaments.enabled,
  }),
  // flow field — absorbs flowFieldSlot.ts:36 (demand-loaded; seed 0)
  layer({
    key: 'flow',
    cluster: 'flow',
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
    cluster: 'volumes',
    expand: () => volumeFieldIds(),
    handle: (id) => ({ kind: 'volumeField', id }),
    seed: () => 0,
    intent: (s, id) => s.volumes.items[id]?.enabled ?? false,
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
