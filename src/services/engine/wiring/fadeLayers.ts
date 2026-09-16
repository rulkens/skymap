/**
 * fadeLayers — the fade-ownership manifest: every fadeable layer as one row, walked
 * once by `seedFades` at bootstrap. The ONE site that calls `fades.register`.
 *
 * Seeds are settings-derived, not a blanket 1.0 — a disabled layer seeded at 1
 * draws on frame 1 before its fade-out fires, and an enabled layer seeded at 0 is
 * invisible until `fadeTo(1)` finishes. Demand-loaded rows are the exception: with
 * no payload at construction they seed at 0 and fade IN on arrival, an asymmetry
 * carried per row as a `seed()` closure rather than one branch over a flag.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { VolumeFieldId } from '../../../@types/data/volume/VolumeFieldId';
import type { EngineState } from '../../../@types/engine/state/EngineState';

import { STRUCTURE_IDS } from '../../../data/structure/structureIds';
import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import { SOURCE_REGISTRY } from '../../../data/sources';
import { maybeLazyLoadDebugVolume } from '../volume/maybeLazyLoadDebugVolume';
import { fadeLayerRow } from '../../../utils/animation/fadeLayerRow';

// INCLUDING the DEV-only binBaseName:null debug fixtures, unlike
// `seedVolumeFields` which excludes them from `settings.volumes.items`. Both the
// debug toggle and the debug slot's commit call `fadeTo` on these ids, and
// `FadeRegistry.fadeTo` THROWS on an unregistered id, so omitting them breaks the
// DEV toggle. A registered-but-never-read handle costs nothing in production.
function volumeFieldIds(): readonly VolumeFieldId[] {
  const ids: VolumeFieldId[] = [];
  for (const entry of Object.values(SOURCE_REGISTRY)) {
    if (entry.type !== 'volume') continue;
    ids.push(entry.id);
  }
  return ids;
}

// `STAR_CATALOG_IDS` spans the whole cluster, but the survey-wide Gaia bin draws
// no per-star names, so its handle would be a controller nothing can move.
// Filtering on `bearsLabel` is also what keeps `item` inside `LabelCategory`.
const LABEL_BEARING_STAR_CATALOG_IDS = SOURCE_ENTRIES.filter(
  (e) => e.type === 'starCatalog' && e.bearsLabel,
).map((e) => e.id);

// The same narrowing for bodies, and here the COMPILER insists: `item` must be a
// `LabelCategory`, so `BODY_IDS` (the settings key domain) is the wider set.
const LABEL_BEARING_BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body' && e.bearsLabel).map(
  (e) => e.id,
);

// Exempt from the volumeField row's demand-loaded guard: their lazy-load is
// triggered by that row's own `post`, which a false guard would skip.
const DEBUG_VOLUME_FIELD_IDS: ReadonlySet<VolumeFieldId> = new Set(
  Object.values(SOURCE_REGISTRY)
    .filter((entry) => entry.type === 'volume' && entry.binBaseName === null)
    .map((entry) => entry.id as VolumeFieldId),
);

export const FADE_LAYERS = [
  fadeLayerRow({
    key: 'milkyWayDisk',
    expand: () => [undefined],
    handle: () => ({ kind: 'milkyWay' }),
    seed: (s) => (s.milkyWay.enabled ? 1 : 0),
    intent: (s) => s.milkyWay.enabled,
  }),
  fadeLayerRow({
    key: 'proceduralDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'proceduralDisks' }),
    seed: () => 1,
  }),
  fadeLayerRow({
    key: 'texturedDisks',
    expand: () => [undefined],
    handle: () => ({ kind: 'overlay', id: 'texturedDisks' }),
    seed: () => 1,
  }),
  fadeLayerRow({
    key: 'volumesMaster',
    expand: () => [undefined],
    handle: () => ({ kind: 'volumesMaster' }),
    seed: (s) => (s.volumes.enabled ? 1 : 0),
    intent: (s) => s.volumes.enabled,
  }),
  fadeLayerRow({
    key: 'milkyWayLabel',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'milkyWay' }),
    seed: (s) => (s.milkyWay.labelEnabled ? 1 : 0),
    intent: (s) => s.milkyWay.labelEnabled,
  }),
  // Curated star-map captions: seeded in code, not demand-loaded, so no guard.
  fadeLayerRow({
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
  fadeLayerRow({
    key: 'bodyLabel',
    expand: () => LABEL_BEARING_BODY_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'body', item: id }),
    seed: (s, id) => (s.bodies.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.bodies.items[id].labelEnabled,
  }),
  fadeLayerRow({
    key: 'scaleBar',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'scaleBar' }),
    seed: () => 1,
  }),
  fadeLayerRow({
    key: 'structureRing',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'structure', id }),
    seed: (s, id) => (s.structures.items[id].enabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].enabled,
  }),
  fadeLayerRow({
    key: 'structureLabel',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'structure', item: id }),
    seed: (s, id) => (s.structures.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].labelEnabled,
  }),
  fadeLayerRow({
    key: 'constellations',
    expand: () => [undefined],
    handle: () => ({ kind: 'constellations' }),
    seed: () => 0,
    intent: (s) => s.constellations.enabled,
    guard: (state) => state.gpu.constellationRenderer?.hasData() ?? false,
  }),
  // The conic table is a compile-time constant with no asset slot, so no
  // demand-loaded guard and the seed follows the toggle: a default-on session must
  // not flash the trails in on frame 1.
  fadeLayerRow({
    key: 'orbitTrails',
    expand: () => [undefined],
    handle: () => ({ kind: 'orbitTrails' }),
    seed: (s) => (s.orbitTrails.enabled ? 1 : 0),
    intent: (s) => s.orbitTrails.enabled,
  }),
  // One toggle drives both the band and its lettering — see zoneOfAvoidanceLayer.
  fadeLayerRow({
    key: 'zoneOfAvoidance',
    expand: () => [undefined],
    handle: () => ({ kind: 'zoneOfAvoidance' }),
    seed: (s) => (s.zoneOfAvoidance.enabled ? 1 : 0),
    intent: (s) => s.zoneOfAvoidance.enabled,
  }),
  fadeLayerRow({
    key: 'flow',
    expand: () => [undefined],
    handle: () => ({ kind: 'flow' }),
    seed: () => 0,
    intent: (s) => s.flow.enabled,
    // Keyed on the renderer's own "cube loaded" truth, so one guarded bridge call
    // is correct for both the toggle and the slot commit that just uploaded it.
    guard: (state) => state.gpu.flowFieldRenderer?.fieldLoaded() ?? false,
  }),
  fadeLayerRow<VolumeFieldId, 'volumeField'>({
    key: 'volumeField',
    expand: () => volumeFieldIds(),
    handle: (id) => ({ kind: 'volumeField', id }),
    seed: () => 0,
    intent: (s, id) => s.volumes.items[id]?.enabled ?? false,
    // The DEV debug fixtures are EXEMPT from the demand-loaded gate: they are
    // loaded BY this row's own `post`, and a false guard short-circuits before
    // `post`, so the toggle that should trigger the lazy-load never would.
    guard: (state, id) =>
      DEBUG_VOLUME_FIELD_IDS.has(id) ||
      (state.gpu.volumeFieldRenderer?.listIds().includes(id) ?? false),
    // Re-reads the just-applied intent so a DISABLE toggle never triggers a load.
    // cf4/mcpm load via reevaluateDemand instead, and the helper is a no-op for
    // them, so the two paths partition.
    post: (state, id) => {
      if (state.settings.volumes.items[id]?.enabled) maybeLazyLoadDebugVolume(state, id);
    },
  }),
] satisfies readonly FadeLayer<unknown>[];

// Called once at bootstrap from `wireSlots`. `register` is idempotent, so manifest
// order is diff-stability only — no row can clobber another.
export function seedFades(state: EngineState): void {
  const { settings } = state;
  const fades = state.subsystems.fades;
  for (const row of state.fadeRows) {
    for (const item of row.expand(state)) {
      fades.register(row.handle(item), row.seed(settings, item));
    }
  }
}
